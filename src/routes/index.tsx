import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { RssIngestForm } from "@/components/rss-ingest-form";
import {
  TrendingUp,
  Activity,
  BarChart3,
  Users,
  Sparkles,
  Trophy,
  Clock,
  Target,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PodMetrics — 中文播客数据分析平台" },
      {
        name: "description",
        content:
          "粘贴播客 RSS，即刻获取更新频率、Apple 榜单变化、用户画像与商业价值评分。",
      },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Clock,
    title: "RSS 自动抓取",
    desc: "解析 iTunes 标签、发布时间与时长，30 秒生成完整画像。",
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
    title: "MCN Dashboard",
    desc: "横向对比候选节目，按商业价值/活跃度排序，导出投放清单。",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section
          className="relative overflow-hidden"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div className="mx-auto max-w-5xl px-6 py-24 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3 w-3" />
              为广告主 & MCN 设计的中文播客数据洞察
            </div>
            <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
              用数据看懂
              <span
                className="ml-2 bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                每一档中文播客
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              聚合 Apple Podcasts、小宇宙、喜马拉雅公开数据，自动评估增长速度、用户活跃度、
              内容生命周期与广告转化潜力。
            </p>
            <div className="mx-auto mt-10 max-w-2xl">
              <RssIngestForm size="lg" />
              <p className="mt-3 text-xs text-muted-foreground">
                试试：<code className="rounded bg-muted px-1.5 py-0.5">https://feeds.megaphone.fm/hubermanlab</code>
                或任意中文播客 RSS
              </p>
            </div>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                to="/dashboard"
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
              >
                查看 Dashboard →
              </Link>
            </div>
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
                RSS 抓取节目元数据、更新频率与历史集；iTunes Lookup
                API 关联 Apple 分类与官方页面。小宇宙、喜马拉雅评论受平台反爬限制，使用基于
                RSS 的估算模型并明确标注。
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
                自动判定节目所处阶段，帮助广告主选择不同投放策略：成长期注重 CPM 效率，成熟期
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
            <span>PodMetrics · 中文播客数据平台</span>
          </div>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
