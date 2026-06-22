import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { PlatformIngestForm } from "@/components/platform-ingest-form";
import {
  TrendingUp,
  Activity,
  BarChart3,
  Users,
  Sparkles,
  Trophy,
  Clock,
  Target,
  ArrowRight,
  Building2,
  ClipboardList,
  Database,
  Mic2,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PodBridge — 播客数据与跨境投放平台" },
      { name: "description", content: "品牌商和播客主进入各自工作台，完成播客投放规划、建联执行和主播商务入驻。" },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Clock,
    title: "小宇宙 / 喜马拉雅优先",
    desc: "优先解析中文播客主阵地的平台主页，再用 RSS 和 Apple 数据补足画像。",
  },
  {
    icon: TrendingUp,
    title: "评论与订阅趋势",
    desc: "每次抓取存档快照，跨周/月对比增长曲线。",
  },
  {
    icon: Trophy,
    title: "Apple 榜单匹配",
    desc: "通过 iTunes Search API 关联 Apple Podcasts 元数据与分类排名。",
  },
  {
    icon: Users,
    title: "用户画像标签",
    desc: "结合分类与近期选题，自动打出受众标签（商业/科技/生活等）。",
  },
  {
    icon: Target,
    title: "商业价值评分",
    desc: "综合活跃度、增长性、时长结构，输出 0-100 广告投放评分。",
  },
  {
    icon: BarChart3,
    title: "播客资源看板",
    desc: "横向对比候选节目，按商业价值/活跃度排序，导出投放清单。",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section
          className="relative overflow-hidden border-b border-border"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl content-center gap-10 px-6 py-12 lg:grid-cols-[0.86fr_1.14fr] lg:py-16">
            <div className="self-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3 w-3" />
                品牌商和播客主的双边投放工作台
              </div>
              <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
                先选择你的身份，
                <span className="block bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>
                  再进入对应工作台
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground">
                品牌商从 Brief 到 Campaign 管理，播客主提交商务资料和报价。平台在中间沉淀数据、联系方式、品牌安全和投放复盘。
              </p>
            </div>

            <div className="grid gap-4 self-center md:grid-cols-2">
              <Link
                to="/planner"
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
                    <Building2 className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <div className="mt-6 text-sm text-muted-foreground">我是品牌商</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">我要投放播客广告</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  填写品牌 Brief，AI 匹配播客，生成 Plan A/B/C，进入建联、报价、上线和复盘流程。
                </p>
                <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Brief → 方案 → Campaign Pipeline
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    品牌安全、报价模型、主播匹配解释
                  </span>
                </div>
              </Link>

              <Link
                to="/creators/join"
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-foreground text-background">
                    <Mic2 className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <div className="mt-6 text-sm text-muted-foreground">我是播客主</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">我要接品牌合作</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  提交节目介绍、联系方式、报价区间、可接广告类型和授权数据，让品牌更快判断是否适合合作。
                </p>
                <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    商务资料、报价、合作偏好
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Database className="h-3.5 w-3.5" />
                    数据可信度：公开数据 / 主播授权 / 人工确认
                  </span>
                </div>
              </Link>

              <div className="rounded-2xl border border-border bg-card/70 p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">已经在做数据整理？</div>
                    <p className="mt-1 text-xs text-muted-foreground">进入播客库查看资源池，或补充小宇宙 / 喜马拉雅主页。</p>
                  </div>
                  <Link
                    to="/dashboard"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    查看播客库
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <div className="mb-4 text-center">
              <div className="text-sm font-medium">补充播客数据源</div>
              <p className="mt-1 text-xs text-muted-foreground">
                运营侧使用：优先导入小宇宙 / 喜马拉雅主页，RSS 作为补充。
              </p>
            </div>
            <PlatformIngestForm />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">一站式播客分析能力</h2>
            <p className="mt-3 text-muted-foreground">
              所有指标来自公开 RSS + Apple iTunes API，合规可追溯。
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div
                  className="mb-4 grid h-10 w-10 place-items-center rounded-lg text-primary-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Methodology */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                数据来源
              </div>
              <h3 className="mt-2 text-xl font-semibold">公开 RSS · Apple Podcasts API</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                RSS 抓取节目元数据、更新频率与历史集；iTunes Lookup API 关联 Apple
                分类与官方页面。小宇宙、喜马拉雅评论受平台反爬限制，使用基于 RSS
                的估算模型并明确标注。
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                评分模型
              </div>
              <h3 className="mt-2 text-xl font-semibold">活跃 · 增长 · 商业 三维评分</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                活跃度衡量更新频率与最新一集距今天数；增长性结合集数累计与持续运营；商业价值
                综合时长结构、平台覆盖与活跃增长权重，输出 0–100 分。
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                生命周期识别
              </div>
              <h3 className="mt-2 text-xl font-semibold">萌芽 → 成长 → 成熟 → 沉寂</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                自动判定节目所处阶段，帮助广告主选择不同投放策略：成长期注重千次曝光成本效率，成熟期
                追求品牌背书。
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>PodBridge · 播客数据 · 中文 + 海外</span>
          </div>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
