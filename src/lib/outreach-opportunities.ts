type PodcastRow = {
  id: string;
  title: string | null;
  author: string | null;
  image_url: string | null;
  category: string | null;
  description: string | null;
  audience_tags: string[] | null;
  episode_count: number | null;
  latest_episode_at: string | null;
  update_frequency_days: number | null;
  commercial_score: number | null;
  activity_score: number | null;
  growth_score: number | null;
  xiaoyuzhou_url: string | null;
  xiaoyuzhou_subscribers: number | null;
  ximalaya_url: string | null;
  ximalaya_subscribers: number | null;
  ximalaya_plays: number | null;
};

type OutreachTier = "头部" | "中腰部" | "长尾" | "未知";

const PODCAST_SELECT = [
  "id",
  "title",
  "author",
  "image_url",
  "category",
  "description",
  "audience_tags",
  "episode_count",
  "latest_episode_at",
  "update_frequency_days",
  "commercial_score",
  "activity_score",
  "growth_score",
  "xiaoyuzhou_url",
  "xiaoyuzhou_subscribers",
  "ximalaya_url",
  "ximalaya_subscribers",
  "ximalaya_plays",
].join(",");

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysSince(iso: string | null) {
  if (!iso) return 999;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function norm(value: string | null | undefined) {
  return (value ?? "").toLocaleLowerCase("zh-CN");
}

const PODCAST_SIGNAL_RE = /播客|podcast|fm|电台|访谈|对谈|聊天|圆桌|talk|radio|节目/i;
const BRAND_RISK_RE =
  /有声书|小说|睡前故事|恐怖|灵异|惊悚|悬疑|犯罪|案件|鬼|诡|相声|评书|合集|故事\s*fm|故事篇|怪奇|怪谈|奇谭|段子|爆笑/i;
const LOW_INTENT_CONTENT_RE =
  /听力|早安英文|单词|助眠|冥想|疗愈|白噪音|ASMR|视频|课程|训练营|朗读|睡前|星座|运势|塔罗|命理|陶白白/i;
const DEFAULT_NARRATIVE_TITLE_RE = /故事|怪奇|怪谈|奇谭|悬疑|案件|档案/i;
const WEAK_CREATOR_PAGE_RE = /^[\u4e00-\u9fa5A-Za-z0-9]{1,4}$/;

function assessBrandFit(p: PodcastRow) {
  const haystack = [p.title, p.author, p.category, p.description, ...(p.audience_tags ?? [])]
    .map((value) => norm(value))
    .join(" ");
  const titleCategoryText = norm([p.title, p.category].filter(Boolean).join(" "));
  const title = p.title ?? "";
  const latestDays = daysSince(p.latest_episode_at);
  const hasRecentEpisode = latestDays <= 45;
  const hasReliableCadence =
    hasRecentEpisode && p.update_frequency_days != null && p.update_frequency_days > 0 && p.update_frequency_days <= 21;
  const isFresh = hasRecentEpisode || hasReliableCadence;
  const hasPodcastShape = Boolean(p.xiaoyuzhou_url) || PODCAST_SIGNAL_RE.test(haystack);
  const isRiskyStoryOrAudio = BRAND_RISK_RE.test(haystack) || p.category === "故事奇谈";
  const isDefaultNarrativeTitle = DEFAULT_NARRATIVE_TITLE_RE.test(titleCategoryText);
  const isLowIntentContent = LOW_INTENT_CONTENT_RE.test(haystack);
  const looksLikeCelebrityAlbum =
    Boolean(p.ximalaya_url) &&
    !p.xiaoyuzhou_url &&
    WEAK_CREATOR_PAGE_RE.test(title) &&
    !/播客|fm|电台|访谈|对谈|聊天|圆桌|talk/i.test(title);
  const isDormantCelebrity = looksLikeCelebrityAlbum && latestDays > 60;
  const baseBrandSuitable =
    hasPodcastShape && isFresh && !isRiskyStoryOrAudio && !isLowIntentContent && !isDormantCelebrity;
  const brandSuitable =
    baseBrandSuitable && !isDefaultNarrativeTitle;
  const warnings = [
    !hasPodcastShape ? "播客形态弱" : null,
    !isFresh ? "最近 45 天缺少有效更新" : null,
    isRiskyStoryOrAudio ? "故事/有声叙事类，默认不进通用建联" : null,
    isDefaultNarrativeTitle ? "叙事故事类标题，需由品牌 Brief 明确召回" : null,
    isLowIntentContent ? "低投放意图内容，默认不进今日建联" : null,
    isDormantCelebrity ? "名人页/专辑页特征明显，且近期更新不足" : null,
  ].filter(Boolean) as string[];

  return { brandSuitable, warnings };
}

function getSupabaseRestConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase 环境变量未配置");
  return { url, key };
}

async function restGet<T>(path: string): Promise<T> {
  const { url, key } = getSupabaseRestConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFastCandidates() {
  const [commercial, growth, subscribers] = await Promise.all([
    restGet<PodcastRow[]>(
      `podcasts?market=eq.cn&select=${PODCAST_SELECT}&order=commercial_score.desc.nullslast&limit=160`,
    ),
    restGet<PodcastRow[]>(
      `podcasts?market=eq.cn&select=${PODCAST_SELECT}&order=growth_score.desc.nullslast&limit=160`,
    ),
    restGet<PodcastRow[]>(
      `podcasts?market=eq.cn&select=${PODCAST_SELECT}&order=xiaoyuzhou_subscribers.desc.nullslast&limit=160`,
    ),
  ]);

  return Array.from(
    new Map([...commercial, ...growth, ...subscribers].map((podcast) => [podcast.id, podcast])).values(),
  );
}

function enrichPodcast(p: PodcastRow) {
  const brandFit = assessBrandFit(p);
  const subscriberCount =
    numberOrNull(p.xiaoyuzhou_subscribers) ??
    numberOrNull(p.ximalaya_subscribers) ??
    null;
  const playCount = numberOrNull(p.ximalaya_plays);
  const audienceTier = classifyOutreachTier(subscriberCount, playCount);
  const recentActivity =
    Math.max(0, 30 - daysSince(p.latest_episode_at)) +
    Math.max(0, 14 - (p.update_frequency_days ?? 14));
  const subscriberScale = Math.min(28, Math.log10(Math.max(subscriberCount ?? 1, 1)) * 5);
  const playScale = Math.min(18, Math.log10(Math.max(playCount ?? 1, 1)) * 2.5);
  const performanceScore = clampScore(
    (p.commercial_score ?? 50) * 0.38 +
      (p.activity_score ?? 50) * 0.18 +
      (p.growth_score ?? 50) * 0.14 +
      subscriberScale +
      playScale * 0.55 +
      recentActivity * 0.65 +
      (brandFit.brandSuitable ? 8 : -28),
  );
  const momentumScore = clampScore(
    (p.growth_score ?? 50) * 0.36 +
      (p.activity_score ?? 50) * 0.18 +
      recentActivity +
      Math.max(0, 16 - (p.update_frequency_days ?? 16)) +
      (brandFit.brandSuitable ? 8 : -24),
  );
  const qualityScore = clampScore(
    performanceScore * 0.45 + momentumScore * 0.3 + (p.commercial_score ?? 50) * 0.25,
  );
  const priorityScore = Math.max(qualityScore, performanceScore, momentumScore);
  const outreachPriority = priorityScore >= 78 ? "高" : priorityScore >= 62 ? "中" : "观察";
  const platform =
    p.xiaoyuzhou_url && p.ximalaya_url
      ? "多平台"
      : p.xiaoyuzhou_url
        ? "小宇宙"
        : p.ximalaya_url
          ? "喜马拉雅"
          : "其他";
  const evidence = [
    subscriberCount != null ? `订阅 ${subscriberCount.toLocaleString()}` : null,
    playCount != null ? `播放 ${playCount.toLocaleString()}` : null,
    p.update_frequency_days != null ? `约 ${p.update_frequency_days} 天/更` : null,
    p.latest_episode_at ? `最新 ${new Date(p.latest_episode_at).toLocaleDateString("zh-CN")}` : null,
    brandFit.brandSuitable ? "品牌适配通过" : brandFit.warnings[0],
    "当前库存数据",
  ].filter(Boolean);

  return {
    id: p.id,
    title: p.title ?? null,
    author: p.author ?? null,
    image_url: p.image_url ?? null,
    category: p.category ?? null,
    platform,
    platform_url: p.xiaoyuzhou_url ?? p.ximalaya_url ?? null,
    audience_tier: audienceTier,
    subscriber_count: subscriberCount,
    ximalaya_plays: playCount,
    commercial_score: p.commercial_score ?? 0,
    activity_score: p.activity_score ?? 0,
    growth_score: p.growth_score ?? 0,
    update_frequency_days: p.update_frequency_days ?? null,
    latest_episode_at: p.latest_episode_at ?? null,
    windows: [
      { days: 7, subscriber_delta: null, subscriber_growth_pct: null, play_delta: null, episode_delta: null },
      { days: 14, subscriber_delta: null, subscriber_growth_pct: null, play_delta: null, episode_delta: null },
      { days: 30, subscriber_delta: null, subscriber_growth_pct: null, play_delta: null, episode_delta: null },
    ],
    snapshot_count: 0,
    last_snapshot_at: null,
    data_freshness_days: null,
    quality_score: qualityScore,
    performance_score: performanceScore,
    momentum_score: momentumScore,
    signal_level: priorityScore >= 78 ? "强信号" : priorityScore >= 62 ? "中信号" : "观察信号",
    brand_suitable: brandFit.brandSuitable,
    fit_warnings: brandFit.warnings,
    outreach_priority: outreachPriority,
    reason:
      qualityScore >= 78
        ? "综合质量高，适合优先询价建联"
        : performanceScore >= momentumScore
          ? "存量表现强，适合进入优先候选池"
          : "增长和更新信号较好，适合小预算测试",
    suggested_action:
      outreachPriority === "高"
        ? "本周优先建联，索要刊例、档期和历史转化案例"
        : outreachPriority === "中"
          ? "加入候选池，先询价并安排小预算测试"
          : "继续观察 7-14 天，等待增长或更新信号更明确",
    evidence,
  };
}

function classifyOutreachTier(subscriberCount: number | null, playCount: number | null): OutreachTier {
  if (subscriberCount == null && playCount == null) return "未知";
  if ((subscriberCount ?? 0) >= 100000 || (playCount ?? 0) >= 10000000) return "头部";
  if ((subscriberCount ?? 0) >= 5000 || (playCount ?? 0) >= 300000) return "中腰部";
  return "长尾";
}

function isMidMarketCandidate(p: ReturnType<typeof enrichPodcast>) {
  return p.audience_tier === "中腰部" || p.audience_tier === "长尾";
}

export async function buildOutreachOpportunities() {
  const candidates = (await fetchFastCandidates()).map(enrichPodcast);
  const eligibleCandidates = candidates.filter((p) => p.brand_suitable);
  const rankingPool = eligibleCandidates.length > 0 ? eligibleCandidates : candidates;
  const midMarketPool = rankingPool.filter(isMidMarketCandidate);
  const topTierPool = rankingPool.filter((p) => p.audience_tier === "头部");
  const unknownPool = rankingPool.filter((p) => p.audience_tier === "未知");
  const preferredPool = midMarketPool.length ? midMarketPool : rankingPool;
  const topTierOutreach = [...topTierPool]
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 8);
  const midMarketOutreach = [...preferredPool]
    .sort(
      (a, b) =>
        Math.max(b.quality_score, b.performance_score, b.momentum_score) -
        Math.max(a.quality_score, a.performance_score, a.momentum_score),
    )
    .slice(0, 14);
  const longTailOutreach = [...rankingPool]
    .filter((p) => p.audience_tier === "长尾")
    .sort((a, b) => b.momentum_score - a.momentum_score)
    .slice(0, 8);
  const topPerformance = [...preferredPool]
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 12);
  const promising = [...preferredPool]
    .sort((a, b) => b.momentum_score - a.momentum_score)
    .slice(0, 12);
  const suggestedOutreach = [...new Map([...midMarketOutreach, ...longTailOutreach, ...unknownPool].map((p) => [p.id, p])).values()]
    .sort(
      (a, b) =>
        Math.max(b.quality_score, b.performance_score, b.momentum_score) -
        Math.max(a.quality_score, a.performance_score, a.momentum_score),
    )
    .slice(0, 18);

  return {
    generatedAt: new Date().toISOString(),
    mode: "fast_inventory",
    windows: [7, 14, 30],
    latestRun: null,
    topPerformance,
    promising,
    suggestedOutreach,
    midMarketOutreach,
    topTierOutreach,
    longTailOutreach,
  };
}
