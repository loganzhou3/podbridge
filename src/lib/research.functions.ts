import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const platformSchema = z.enum(["喜马拉雅", "小宇宙", "Apple Podcast", "Spotify", "其他"]);
const taskStatusSchema = z.enum(["pending", "collecting", "completed", "abandoned"]);
const captureMethodSchema = z.enum(["manual", "browser-assisted", "imported"]);

type AnySupabase = typeof supabaseAdmin & {
  from: (table: string) => ReturnType<typeof supabaseAdmin.from>;
};

function db() {
  return supabaseAdmin as AnySupabase;
}

function toArray(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildResearchSearchUrl(platform: string, keyword: string) {
  const q = encodeURIComponent(keyword.trim());
  if (!q) return "";
  if (platform === "喜马拉雅") return `https://www.ximalaya.com/search/${q}`;
  if (platform === "小宇宙") return `https://www.xiaoyuzhoufm.com/search?q=${q}`;
  if (platform === "Apple Podcast") return `https://podcasts.apple.com/search?term=${q}`;
  if (platform === "Spotify") return `https://open.spotify.com/search/${q}/shows`;
  return `https://www.google.com/search?q=${q}%20podcast`;
}

function inferAiTags(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  updateFrequency?: string | null;
  visibleFollowers?: number | null;
  visiblePlayCount?: number | null;
}) {
  const text = `${input.title} ${input.description ?? ""} ${input.category ?? ""}`.toLowerCase();
  const tags = new Set<string>();
  const fit = new Set<string>();
  const risks: string[] = [];
  const formats = new Set<string>(["口播"]);

  if (/科技|ai|人工智能|创业|商业|business|tech|saas/.test(text)) {
    tags.add("商业科技");
    fit.add("AI 工具");
    fit.add("SaaS");
    formats.add("访谈");
  }
  if (/消费|生活方式|女性|心理|健康|亲子|成长/.test(text)) {
    tags.add("生活消费");
    fit.add("消费品牌");
    fit.add("健康生活");
    formats.add("联名内容");
  }
  if (/财经|投资|股票|基金|crypto|web3/.test(text)) {
    tags.add("财经投资");
    fit.add("金融科技");
    risks.push("财经观点需人工复核合规边界");
  }
  if (/娱乐|影视|脱口秀|喜剧|八卦|故事/.test(text)) {
    tags.add("泛娱乐");
    fit.add("内容平台");
    formats.add("冠名");
  }
  if (!tags.size) tags.add(input.category || "待人工确认");
  if (!fit.size) fit.add("待人工确认");
  if (input.updateFrequency && /停更|不稳定|低频/.test(input.updateFrequency)) {
    risks.push("更新稳定性需复核");
  }
  if ((input.visibleFollowers ?? 0) > 50000 || (input.visiblePlayCount ?? 0) > 1000000) {
    tags.add("高可见度");
  }

  return {
    ai_tags: Array.from(tags),
    ai_brand_fit: Array.from(fit),
    ai_brand_safety: {
      label: risks.length ? "中风险待确认" : "低风险初筛",
      risks,
      note: "AI 推断，不代表平台官方数据；请以人工复核和公开来源为准。",
    },
    ai_recommended_formats: Array.from(formats),
  };
}

function platformUrlColumn(platform: string) {
  if (platform === "小宇宙") return "xiaoyuzhou_url";
  if (platform === "喜马拉雅") return "ximalaya_url";
  if (platform === "Apple Podcast") return "itunes_url";
  return null;
}

function platformSubscriberColumn(platform: string) {
  if (platform === "小宇宙") return "xiaoyuzhou_subscribers";
  if (platform === "喜马拉雅") return "ximalaya_subscribers";
  if (platform === "Apple Podcast") return "apple_subscribers";
  return "monthly_active_listeners";
}

function buildPodcastResearchFields(data: {
  platform: string;
  sourceUrl: string;
  rssUrl?: string | null;
  podcastTitle: string;
  hostName?: string | null;
  description?: string | null;
  category?: string | null;
  episodeCount?: number | null;
  latestEpisodeDate?: string | null;
  visibleFollowers?: number | null;
  visiblePlayCount?: number | null;
  commentCount?: number | null;
  aiTags: string[];
  capturedAt: string;
  captureMethod: string;
  confidence: number;
  evidenceNote: string;
}) {
  const urlColumn = platformUrlColumn(data.platform);
  const subscriberColumn = platformSubscriberColumn(data.platform);
  const row: Record<string, unknown> = {
    title: data.podcastTitle,
    author: data.hostName || null,
    description: data.description || null,
    category: data.category || null,
    episode_count: data.episodeCount ?? null,
    latest_episode_at: data.latestEpisodeDate || null,
    audience_tags: data.aiTags,
    last_synced_at: data.capturedAt,
    metrics_updated_at: data.capturedAt,
    metrics_notes: JSON.stringify({
      research_capture: {
        platform: data.platform,
        sourceUrl: data.sourceUrl,
        capturedAt: data.capturedAt,
        captureMethod: data.captureMethod,
        confidence: data.confidence,
        note: data.evidenceNote,
        aiDisclaimer: "AI 推断，不代表平台官方数据",
      },
    }),
  };
  if (data.rssUrl) row.rss_url = data.rssUrl;
  if (urlColumn) row[urlColumn] = data.sourceUrl;
  if (subscriberColumn && data.visibleFollowers != null) row[subscriberColumn] = data.visibleFollowers;
  if (data.platform === "喜马拉雅" && data.visiblePlayCount != null) row.ximalaya_plays = data.visiblePlayCount;
  if (data.platform === "小宇宙" && data.commentCount != null) row.xiaoyuzhou_comments = data.commentCount;
  if (data.platform === "喜马拉雅" && data.commentCount != null) row.ximalaya_comments = data.commentCount;
  return row;
}

export const listResearchWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const [tasksRes, recordsRes] = await Promise.all([
    db().from("research_tasks").select("*").order("created_at", { ascending: false }).limit(50),
    db()
      .from("research_capture_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  if (tasksRes.error || recordsRes.error) {
    const message = tasksRes.error?.message ?? recordsRes.error?.message ?? "";
    if (/does not exist|schema cache|Could not find the table/i.test(message)) {
      return {
        tasks: [],
        records: [],
        setupRequired: true,
        setupMessage: "Research Capture 数据表尚未创建，请先执行 supabase/migrations/20260612093000_research_capture.sql。",
      };
    }
    throw new Error(message);
  }
  return { tasks: tasksRes.data ?? [], records: recordsRes.data ?? [], setupRequired: false, setupMessage: null };
});

export const createResearchTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        keyword: z.string().trim().min(1).max(160),
        targetCategory: z.string().trim().max(100).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        status: taskStatusSchema.default("pending"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await db()
      .from("research_tasks")
      .insert({
        platform: data.platform,
        keyword: data.keyword,
        target_category: data.targetCategory || null,
        notes: data.notes || null,
        status: data.status,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { task: row, searchUrl: buildResearchSearchUrl(data.platform, data.keyword) };
  });

export const updateResearchTaskStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: taskStatusSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await db()
      .from("research_tasks")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const findSimilarPodcastsForResearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ title: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const terms = data.title
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const term = terms[0] || data.title;
    const { data: rows, error } = await supabaseAdmin
      .from("podcasts")
      .select("id,title,author,category,image_url,xiaoyuzhou_url,ximalaya_url,itunes_url")
      .ilike("title", `%${term}%`)
      .limit(8);
    if (error) throw new Error(error.message);
    return { podcasts: rows ?? [] };
  });

export const saveResearchCaptureRecord = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        taskId: z.string().uuid().nullable().optional(),
        podcastId: z.string().uuid().nullable().optional(),
        linkMode: z.enum(["create", "link"]).default("create"),
        platform: platformSchema,
        podcastTitle: z.string().trim().min(1).max(300),
        hostName: z.string().trim().max(200).nullable().optional(),
        description: z.string().trim().max(5000).nullable().optional(),
        category: z.string().trim().max(120).nullable().optional(),
        sourceUrl: z.string().trim().url().max(1000),
        rssUrl: z.string().trim().url().max(1000).nullable().optional(),
        visibleFollowers: z.number().int().min(0).nullable().optional(),
        visiblePlayCount: z.number().int().min(0).nullable().optional(),
        episodeCount: z.number().int().min(0).nullable().optional(),
        latestEpisodeDate: z.string().trim().max(30).nullable().optional(),
        updateFrequency: z.string().trim().max(120).nullable().optional(),
        commentCount: z.number().int().min(0).nullable().optional(),
        rankingInfo: z.string().trim().max(500).nullable().optional(),
        suitableIndustries: z.string().trim().max(800).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
        capturedBy: z.string().trim().min(1).max(100).default("manual"),
        captureMethod: captureMethodSchema.default("manual"),
        confidence: z.number().int().min(0).max(100).default(80),
        evidenceNote: z.string().trim().min(1).max(2000),
        screenshotUrl: z.string().trim().url().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    let podcastId = data.podcastId ?? null;
    const ai = inferAiTags({
      title: data.podcastTitle,
      description: data.description,
      category: data.category,
      updateFrequency: data.updateFrequency,
      visibleFollowers: data.visibleFollowers,
      visiblePlayCount: data.visiblePlayCount,
    });

    if (data.linkMode === "create" || !podcastId) {
      const insertRow: Record<string, unknown> = {
        rss_url: data.rssUrl || data.sourceUrl,
        language: data.platform === "Apple Podcast" || data.platform === "Spotify" ? "en" : "zh-CN",
        market: data.platform === "Apple Podcast" || data.platform === "Spotify" ? "na" : "cn",
        ...buildPodcastResearchFields({
          ...data,
          aiTags: ai.ai_tags,
          capturedAt: now,
        }),
      };

      const { data: pod, error: podError } = await supabaseAdmin
        .from("podcasts")
        .upsert(insertRow, { onConflict: "rss_url" })
        .select("id")
        .single();
      if (podError) throw new Error(podError.message);
      podcastId = pod.id;
    } else {
      const updateFields = buildPodcastResearchFields({
        ...data,
        aiTags: ai.ai_tags,
        capturedAt: now,
      });
      for (const [key, value] of Object.entries(updateFields)) {
        if (
          value == null &&
          !["metrics_notes", "metrics_updated_at", "last_synced_at"].includes(key)
        ) {
          delete updateFields[key];
        }
      }
      const { error: updateError } = await supabaseAdmin
        .from("podcasts")
        .update(updateFields)
        .eq("id", podcastId);
      if (updateError) throw new Error(updateError.message);
    }

    const captureRow = {
      task_id: data.taskId ?? null,
      podcast_id: podcastId,
      platform: data.platform,
      podcast_title: data.podcastTitle,
      host_name: data.hostName || null,
      description: data.description || null,
      category: data.category || null,
      source_url: data.sourceUrl,
      rss_url: data.rssUrl || null,
      visible_followers: data.visibleFollowers ?? null,
      visible_play_count: data.visiblePlayCount ?? null,
      episode_count: data.episodeCount ?? null,
      latest_episode_date: data.latestEpisodeDate || null,
      update_frequency: data.updateFrequency || null,
      comment_count: data.commentCount ?? null,
      ranking_info: data.rankingInfo || null,
      suitable_industries: toArray(data.suitableIndustries),
      notes: data.notes || null,
      captured_at: now,
      captured_by: data.capturedBy,
      capture_method: data.captureMethod,
      confidence: data.confidence,
      evidence_note: data.evidenceNote,
      screenshot_url: data.screenshotUrl || null,
      ai_tags: ai.ai_tags,
      ai_brand_fit: ai.ai_brand_fit,
      ai_brand_safety: ai.ai_brand_safety,
      ai_recommended_formats: ai.ai_recommended_formats,
      status: "captured",
    };

    const { data: record, error: recordError } = await db()
      .from("research_capture_records")
      .insert(captureRow)
      .select("*")
      .single();
    if (recordError) throw new Error(recordError.message);

    const claims = [
      `${data.podcastTitle} 在${data.platform}公开页存在`,
      data.visibleFollowers != null ? `公开可见订阅/粉丝数：${data.visibleFollowers}` : null,
      data.visiblePlayCount != null ? `公开可见播放量：${data.visiblePlayCount}` : null,
      data.commentCount != null ? `公开可见评论数：${data.commentCount}` : null,
      data.rankingInfo ? `公开榜单/评分信息：${data.rankingInfo}` : null,
    ].filter(Boolean) as string[];

    const evidenceRows = claims.map((claim) => ({
      podcast_id: podcastId,
      record_id: record.id,
      claim,
      source_platform: data.platform,
      source_label: `${data.platform}公开页`,
      source_url: data.sourceUrl,
      confidence: data.confidence,
      captured_at: now,
      captured_by: data.capturedBy,
      capture_method: data.captureMethod,
      explanation: data.evidenceNote,
      screenshot_url: data.screenshotUrl || null,
    }));
    const { error: evidenceError } = await db().from("podcast_source_evidence").insert(evidenceRows);
    if (evidenceError) throw new Error(evidenceError.message);

    if (data.taskId) {
      await db()
        .from("research_tasks")
        .update({ status: "collecting", updated_at: now })
        .eq("id", data.taskId)
        .eq("status", "pending");
    }

    return { record, podcastId, ai, evidenceCount: evidenceRows.length };
  });
