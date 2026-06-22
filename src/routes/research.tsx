import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import {
  buildResearchSearchUrl,
  createResearchTask,
  findSimilarPodcastsForResearch,
  listResearchWorkspace,
  saveResearchCaptureRecord,
  updateResearchTaskStatus,
} from "@/lib/research.functions";
import type { CaptureMethod, ResearchPlatform, ResearchTaskStatus } from "@/lib/research.types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileSearch,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [{ title: "数据采集工作台 — PodBridge" }],
  }),
  component: ResearchPage,
});

const PLATFORMS: ResearchPlatform[] = ["喜马拉雅", "小宇宙", "Apple Podcast", "Spotify", "其他"];
const TASK_STATUSES: Array<[ResearchTaskStatus, string]> = [
  ["pending", "待采集"],
  ["collecting", "采集中"],
  ["completed", "已完成"],
  ["abandoned", "已废弃"],
];
const CAPTURE_METHODS: Array<[CaptureMethod, string]> = [
  ["manual", "人工确认"],
  ["browser-assisted", "浏览器辅助"],
  ["imported", "文件导入"],
];

function numberFromForm(fd: FormData, name: string) {
  const raw = String(fd.get(name) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function textFromForm(fd: FormData, name: string) {
  return String(fd.get(name) ?? "").trim();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function taskStatusLabel(value: string) {
  return TASK_STATUSES.find(([id]) => id === value)?.[1] ?? value;
}

function captureMethodLabel(value: string) {
  return CAPTURE_METHODS.find(([id]) => id === value)?.[1] ?? value;
}

function ResearchPage() {
  const listWorkspace = useServerFn(listResearchWorkspace);
  const createTask = useServerFn(createResearchTask);
  const updateTask = useServerFn(updateResearchTaskStatus);
  const saveRecord = useServerFn(saveResearchCaptureRecord);
  const findSimilar = useServerFn(findSimilarPodcastsForResearch);

  const [platformFilter, setPlatformFilter] = useState<ResearchPlatform | "all">("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedTaskPlatform, setSelectedTaskPlatform] = useState<ResearchPlatform>("小宇宙");
  const [podcastTitle, setPodcastTitle] = useState("");
  const [similarPodcasts, setSimilarPodcasts] = useState<Array<Record<string, unknown>>>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [checkingSimilar, setCheckingSimilar] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["research-workspace"],
    queryFn: () => listWorkspace(),
  });

  const tasks = data?.tasks ?? [];
  const records = data?.records ?? [];
  const visibleTasks = platformFilter === "all" ? tasks : tasks.filter((task) => task.platform === platformFilter);
  const visibleRecords =
    platformFilter === "all" ? records : records.filter((record) => record.platform === platformFilter);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const generatedSearchUrl = useMemo(() => {
    if (!selectedTask) return "";
    return buildResearchSearchUrl(selectedTask.platform, selectedTask.keyword);
  }, [selectedTask]);

  async function handleCreateTask(form: HTMLFormElement) {
    const fd = new FormData(form);
    setSavingTask(true);
    try {
      const result = await createTask({
        data: {
          platform: textFromForm(fd, "platform") as ResearchPlatform,
          keyword: textFromForm(fd, "keyword"),
          targetCategory: textFromForm(fd, "targetCategory") || null,
          notes: textFromForm(fd, "notes") || null,
          status: "pending",
        },
      });
      setSelectedTaskId(result.task.id);
      setSelectedTaskPlatform(result.task.platform as ResearchPlatform);
      form.reset();
      toast.success("采集任务已创建");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建任务失败");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleStatusChange(id: string, status: ResearchTaskStatus) {
    await updateTask({ data: { id, status } });
    toast.success("任务状态已更新");
    refetch();
  }

  async function handleCheckSimilar() {
    if (!podcastTitle.trim()) {
      toast.error("先输入节目名称");
      return;
    }
    setCheckingSimilar(true);
    try {
      const result = await findSimilar({ data: { title: podcastTitle.trim() } });
      setSimilarPodcasts(result.podcasts as Array<Record<string, unknown>>);
      if (result.podcasts.length) {
        toast.warning("可能已存在相同播客，请确认是否合并。");
      } else {
        toast.success("暂未发现高度相似播客，可以创建新播客。");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "查询重复失败");
    } finally {
      setCheckingSimilar(false);
    }
  }

  async function handleSaveRecord(form: HTMLFormElement) {
    const fd = new FormData(form);
    const sourceUrl = textFromForm(fd, "sourceUrl");
    const evidenceNote = textFromForm(fd, "evidenceNote");
    if (!sourceUrl || !evidenceNote) {
      toast.error("sourceUrl 和 evidenceNote 必填");
      return;
    }
    setSavingRecord(true);
    try {
      const result = await saveRecord({
        data: {
          taskId: selectedTaskId || null,
          podcastId: selectedPodcastId || null,
          linkMode: selectedPodcastId ? "link" : "create",
          platform: textFromForm(fd, "recordPlatform") as ResearchPlatform,
          podcastTitle: podcastTitle.trim() || textFromForm(fd, "podcastTitle"),
          hostName: textFromForm(fd, "hostName") || null,
          description: textFromForm(fd, "description") || null,
          category: textFromForm(fd, "category") || null,
          sourceUrl,
          rssUrl: textFromForm(fd, "rssUrl") || null,
          visibleFollowers: numberFromForm(fd, "visibleFollowers"),
          visiblePlayCount: numberFromForm(fd, "visiblePlayCount"),
          episodeCount: numberFromForm(fd, "episodeCount"),
          latestEpisodeDate: textFromForm(fd, "latestEpisodeDate") || null,
          updateFrequency: textFromForm(fd, "updateFrequency") || null,
          commentCount: numberFromForm(fd, "commentCount"),
          rankingInfo: textFromForm(fd, "rankingInfo") || null,
          suitableIndustries: textFromForm(fd, "suitableIndustries") || null,
          notes: textFromForm(fd, "notes") || null,
          capturedBy: textFromForm(fd, "capturedBy") || "manual",
          captureMethod: textFromForm(fd, "captureMethod") as CaptureMethod,
          confidence: numberFromForm(fd, "confidence") ?? 80,
          evidenceNote,
          screenshotUrl: textFromForm(fd, "screenshotUrl") || null,
        },
      });
      form.reset();
      setPodcastTitle("");
      setSelectedPodcastId("");
      setSimilarPodcasts([]);
      toast.success(`采集记录已保存，已写入 ${result.evidenceCount} 条来源证据`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存采集记录失败");
    } finally {
      setSavingRecord(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-3">
              Research Capture
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">数据采集工作台</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              用人工确认和浏览器辅助方式记录喜马拉雅、小宇宙、Apple Podcast 等公开信息，为播客库和 Evidence 系统提供真实来源。
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              <Database className="h-4 w-4" />
              返回播客库
            </Link>
          </Button>
        </div>

        <Alert className="mt-6 border-amber-300 bg-amber-50 text-amber-950">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>合规提示</AlertTitle>
          <AlertDescription>
            仅记录公开可见数据。请勿绕过登录、验证码、付费墙或平台访问限制。所有 AI 分析均为推断结果，需要人工确认。
          </AlertDescription>
        </Alert>

        {data?.setupRequired && (
          <Alert className="mt-4 border-destructive/40 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>需要初始化数据表</AlertTitle>
            <AlertDescription>{data.setupMessage}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">关键词搜索任务</div>
                <p className="mt-1 text-xs text-muted-foreground">生成外部搜索链接，人工查看公开页面。</p>
              </div>
              <FileSearch className="h-5 w-5 text-primary" />
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateTask(e.currentTarget);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className="text-xs text-muted-foreground">平台</label>
                  <select
                    name="platform"
                    defaultValue="小宇宙"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">搜索关键词</label>
                  <Input name="keyword" className="mt-1" placeholder="例如：AI 创业" required />
                </div>
              </div>
              <Input name="targetCategory" placeholder="目标分类，例如 商业科技" />
              <Textarea name="notes" rows={3} placeholder="任务备注" />
              <Button type="submit" disabled={savingTask} className="w-full">
                {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                创建任务
              </Button>
            </form>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant={platformFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatformFilter("all")}
              >
                全部
              </Button>
              {PLATFORMS.map((platform) => (
                <Button
                  key={platform}
                  variant={platformFilter === platform ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPlatformFilter(platform)}
                >
                  {platform}
                </Button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {isLoading && <div className="text-sm text-muted-foreground">加载任务中...</div>}
              {visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-xl border p-3 ${
                    selectedTaskId === task.id ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setSelectedTaskPlatform(task.platform as ResearchPlatform);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{task.keyword}</div>
                      <Badge variant="secondary" className="text-[10px]">
                        {taskStatusLabel(task.status)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {task.platform} · {task.target_category || "未分类"} · {fmtDate(task.created_at)}
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={buildResearchSearchUrl(task.platform, task.keyword)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-muted"
                    >
                      <ExternalLink className="h-3 w-3" />
                      打开搜索
                    </a>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value as ResearchTaskStatus)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {TASK_STATUSES.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {!isLoading && !visibleTasks.length && (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  暂无任务。先创建一个关键词搜索任务。
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">搜索链接生成</div>
                  <p className="mt-1 text-xs text-muted-foreground">点击后在新窗口打开平台页面，人工查看公开结果。</p>
                </div>
                <Badge variant="outline">{selectedTask ? selectedTask.platform : "请选择任务"}</Badge>
              </div>
              {selectedTask ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{selectedTask.keyword}</div>
                    <div className="truncate text-xs text-muted-foreground">{generatedSearchUrl}</div>
                  </div>
                  <Button asChild>
                    <a href={generatedSearchUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      打开搜索页
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  从左侧选择任务后会生成搜索链接。
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">手动录入播客信息</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    保存后可创建新播客，或关联到已有播客。每条记录必须包含来源 URL、采集时间、采集方式和置信度。
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">AI 推断需人工确认</Badge>
              </div>

              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveRecord(e.currentTarget);
                }}
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <label className="text-xs text-muted-foreground">平台</label>
                    <select
                      name="recordPlatform"
                      value={selectedTaskPlatform}
                      onChange={(e) => setSelectedTaskPlatform(e.target.value as ResearchPlatform)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground">节目名称</label>
                    <Input
                      name="podcastTitle"
                      value={podcastTitle}
                      onChange={(e) => setPodcastTitle(e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={handleCheckSimilar} disabled={checkingSimilar}>
                      {checkingSimilar ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                      查重
                    </Button>
                  </div>
                </div>

                {similarPodcasts.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      可能已存在相同播客，请确认是否合并。
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {similarPodcasts.map((podcast) => (
                        <label
                          key={String(podcast.id)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-white/70 p-2 text-sm"
                        >
                          <input
                            type="radio"
                            name="existingPodcast"
                            checked={selectedPodcastId === podcast.id}
                            onChange={() => setSelectedPodcastId(String(podcast.id))}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{String(podcast.title ?? "未命名")}</span>
                            <span className="block truncate text-xs text-amber-800">
                              {String(podcast.author ?? "未知主播")} · {String(podcast.category ?? "未分类")}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSelectedPodcastId("")}>
                      创建为新播客
                    </Button>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-3">
                  <Input name="hostName" placeholder="主播名称" />
                  <Input name="category" placeholder="分类" />
                  <Input name="rssUrl" placeholder="RSS URL，如有" />
                </div>
                <Textarea name="description" rows={4} placeholder="简介" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input name="sourceUrl" placeholder="主页 URL / 公开来源 URL（必填）" required />
                  <Input name="screenshotUrl" placeholder="截图 URL，可选" />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <Input name="visibleFollowers" type="number" min="0" placeholder="可见订阅/粉丝数" />
                  <Input name="visiblePlayCount" type="number" min="0" placeholder="可见播放量" />
                  <Input name="episodeCount" type="number" min="0" placeholder="单集数量" />
                  <Input name="commentCount" type="number" min="0" placeholder="评论数量" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input name="latestEpisodeDate" type="date" placeholder="最近更新时间" />
                  <Input name="updateFrequency" placeholder="更新频率，例如 周更" />
                  <Input name="rankingInfo" placeholder="评分或榜单排名" />
                </div>
                <Input name="suitableIndustries" placeholder="适合投放行业，用顿号/逗号分隔" />
                <div className="grid gap-3 md:grid-cols-3">
                  <Input name="capturedBy" placeholder="采集人，例如 pengyuyan" defaultValue="manual" />
                  <select
                    name="captureMethod"
                    defaultValue="manual"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CAPTURE_METHODS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Input name="confidence" type="number" min="0" max="100" defaultValue={85} placeholder="置信度 0-100" />
                </div>
                <Textarea name="evidenceNote" rows={3} placeholder="证据说明：你在公开页看到了什么，为什么认为这条数据可信（必填）" required />
                <Textarea name="notes" rows={3} placeholder="备注" />

                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    保存后 AI 结构化辅助
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    会基于你录入的文本生成内容分类、受众标签、品牌适配行业、商业价值初筛、Brand Safety 初步风险和推荐投放形式。所有结果都会标注“AI 推断，不代表平台官方数据”。
                  </p>
                </div>

                <Button type="submit" disabled={savingRecord} className="w-full">
                  {savingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  保存采集记录并写入播客库
                </Button>
              </form>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">采集记录</div>
                  <p className="mt-1 text-xs text-muted-foreground">每条记录都保留来源 URL、采集时间、采集方式和置信度。</p>
                </div>
                <Badge variant="outline">{visibleRecords.length} 条</Badge>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">节目</th>
                      <th className="py-2 pr-3">来源证据</th>
                      <th className="py-2 pr-3">公开指标</th>
                      <th className="py-2 pr-3">AI 标签</th>
                      <th className="py-2 pr-3">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleRecords.map((record) => (
                      <tr key={record.id} className="align-top">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{record.podcast_title}</div>
                          <div className="text-xs text-muted-foreground">
                            {record.platform} · {record.category || "未分类"} · {record.host_name || "未知主播"}
                          </div>
                          {record.podcast_id && (
                            <Link
                              to="/podcast/$id"
                              params={{ id: record.podcast_id }}
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              查看详情
                            </Link>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <a
                            href={record.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            来源：{record.platform}公开页
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <div className="mt-1 text-xs text-muted-foreground">
                            采集时间：{fmtDate(record.captured_at)} · 采集方式：
                            {captureMethodLabel(record.capture_method)} · 置信度：{record.confidence}%
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{record.evidence_note}</div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          粉丝/订阅：{record.visible_followers ?? "—"}
                          <br />
                          播放：{record.visible_play_count ?? "—"} · 评论：{record.comment_count ?? "—"}
                          <br />
                          单集：{record.episode_count ?? "—"} · 最近：{record.latest_episode_date ?? "—"}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {(record.ai_tags ?? []).slice(0, 4).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-2 text-xs text-amber-700">AI 推断，不代表平台官方数据</div>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant="outline">{record.status}</Badge>
                        </td>
                      </tr>
                    ))}
                    {!visibleRecords.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                          暂无采集记录。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
