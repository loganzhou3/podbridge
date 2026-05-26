import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Firecrawl ----------
function getFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY 未配置");
  return new Firecrawl({ apiKey });
}

// ---------- Lovable AI ----------
async function callLovableAI(
  messages: Array<{ role: string; content: string }>,
  opts?: { json?: boolean },
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY 未配置");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
  if (res.status === 402) throw new Error("AI 额度已用尽，请在 Settings → Usage 添加额度");
  if (!res.ok) throw new Error(`AI 调用失败：${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function safeParseJson(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------- Update platform URLs ----------
export const updatePodcastPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        podcastId: z.string().uuid(),
        xiaoyuzhouUrl: z.string().url().max(2048).optional().nullable(),
        ximalayaUrl: z.string().url().max(2048).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("podcasts")
      .update({
        xiaoyuzhou_url: data.xiaoyuzhouUrl ?? null,
        ximalaya_url: data.ximalayaUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.podcastId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Scrape Xiaoyuzhou / Ximalaya ----------
function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].replace(/,/g, "");
      let val = parseFloat(raw);
      if (/万/.test(m[0])) val *= 10000;
      if (/亿/.test(m[0])) val *= 1_0000_0000;
      if (!isNaN(val)) return Math.round(val);
    }
  }
  return null;
}

const XYZ_SUBS_PATTERNS = [
  /([\d.,]+\s*[万亿]?)\s*(?:订阅|关注者?)/,
  /(?:订阅|关注)\s*[:：]?\s*([\d.,]+\s*[万亿]?)/,
];
const XYZ_EPISODE_PATTERNS = [/([\d.,]+\s*[万亿]?)\s*(?:期|集)/];
const XYZ_COMMENTS_PATTERNS = [/([\d.,]+\s*[万亿]?)\s*(?:条?评论|留言)/];
const XMLY_PLAYS_PATTERNS = [
  /([\d.,]+\s*[万亿]?)\s*(?:播放|次播放)/,
  /(?:播放量|总播放)\s*[:：]?\s*([\d.,]+\s*[万亿]?)/,
];
const XMLY_SUBS_PATTERNS = [/([\d.,]+\s*[万亿]?)\s*(?:订阅|订阅者)/];
const XMLY_COMMENTS_PATTERNS = [/([\d.,]+\s*[万亿]?)\s*(?:条?评论|留言)/];

type PlatformScrape = {
  title: string | null;
  author: string | null;
  description: string | null;
  image: string | null;
  subs: number | null;
  comments: number | null;
  episodeCount: number | null;
  plays: number | null;
};

async function scrapePlatformUrl(url: string, kind: "xyz" | "xmly"): Promise<PlatformScrape> {
  const fc = getFirecrawl();
  const r = (await fc.scrape(url, {
    formats: ["markdown"],
    onlyMainContent: false,
  })) as {
    markdown?: string;
    metadata?: { title?: string; description?: string; ogImage?: string; author?: string };
  };
  const md = r.markdown ?? "";
  const meta = r.metadata ?? {};
  const imgMatch = md.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)/);
  const image = imgMatch?.[1] ?? meta.ogImage ?? null;
  let title = meta.title ?? null;
  if (title) {
    title = title
      .replace(/[\|\-–—]\s*(小宇宙|喜马拉雅|xiaoyuzhou|Ximalaya).*$/i, "")
      .trim();
  }
  const description = meta.description ?? null;
  const author = meta.author ?? null;

  if (kind === "xyz") {
    return {
      title,
      author,
      description,
      image,
      subs: extractNumber(md, XYZ_SUBS_PATTERNS),
      comments: extractNumber(md, XYZ_COMMENTS_PATTERNS),
      episodeCount: extractNumber(md, XYZ_EPISODE_PATTERNS),
      plays: null,
    };
  }
  return {
    title,
    author,
    description,
    image,
    subs: extractNumber(md, XMLY_SUBS_PATTERNS),
    comments: extractNumber(md, XMLY_COMMENTS_PATTERNS),
    episodeCount: extractNumber(md, XYZ_EPISODE_PATTERNS),
    plays: extractNumber(md, XMLY_PLAYS_PATTERNS),
  };
}

export const scrapePodcastPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ podcastId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .select("id,xiaoyuzhou_url,ximalaya_url,itunes_id")
      .eq("id", data.podcastId)
      .single();
    if (error || !pod) throw new Error("播客不存在");
    if (!pod.xiaoyuzhou_url && !pod.ximalaya_url && !pod.itunes_id) {
      throw new Error("请先填写小宇宙 / 喜马拉雅 / Apple 链接");
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (pod.xiaoyuzhou_url) {
      try {
        const s = await scrapePlatformUrl(pod.xiaoyuzhou_url, "xyz");
        updates.xiaoyuzhou_subscribers = s.subs;
        updates.xiaoyuzhou_comments = s.comments;
        updates.xiaoyuzhou_episode_count = s.episodeCount;
      } catch (e) {
        console.error("xiaoyuzhou scrape failed", e);
      }
    }

    if (pod.ximalaya_url) {
      try {
        const s = await scrapePlatformUrl(pod.ximalaya_url, "xmly");
        updates.ximalaya_plays = s.plays;
        updates.ximalaya_subscribers = s.subs;
        updates.ximalaya_comments = s.comments;
      } catch (e) {
        console.error("ximalaya scrape failed", e);
      }
    }

    if (pod.itunes_id) {
      try {
        const rssUrl = `https://itunes.apple.com/cn/rss/customerreviews/id=${pod.itunes_id}/json`;
        const r = await fetch(rssUrl);
        if (r.ok) {
          const j = (await r.json()) as { feed?: { entry?: unknown[] } };
          const entries = j.feed?.entry;
          if (Array.isArray(entries)) {
            updates.apple_reviews = Math.max(0, entries.length - 1);
          }
        }
      } catch (e) {
        console.error("apple reviews fetch failed", e);
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("podcasts")
      .update(updates)
      .eq("id", data.podcastId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, updates };
  });

// ---------- Ingest directly from Xiaoyuzhou / Ximalaya homepage URL ----------
function detectPlatform(url: string): "xyz" | "xmly" | null {
  if (/xiaoyuzhoufm\.com\/podcast/i.test(url)) return "xyz";
  if (/ximalaya\.com\/(album|podcast)/i.test(url)) return "xmly";
  return null;
}

export const ingestFromPlatformUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().url().max(2048),
        market: z.enum(["cn", "na"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const kind = detectPlatform(data.url);
    if (!kind) {
      return {
        ok: false as const,
        error:
          "仅支持小宇宙 (xiaoyuzhoufm.com/podcast/...) 或喜马拉雅 (ximalaya.com/album/...) 链接",
        podcastId: null,
      };
    }
    try {
      const s = await scrapePlatformUrl(data.url, kind);
      if (!s.title) {
        return {
          ok: false as const,
          error: "无法识别播客标题，请检查链接",
          podcastId: null,
        };
      }

      const conflictCol = kind === "xyz" ? "xiaoyuzhou_url" : "ximalaya_url";
      const row: Record<string, unknown> = {
        title: s.title,
        author: s.author,
        description: (s.description ?? "").slice(0, 2000),
        image_url: s.image,
        market: data.market ?? "cn",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        episode_count: s.episodeCount ?? 0,
        commercial_score: 50,
        activity_score: 50,
        growth_score: 50,
        lifecycle_stage: "成长期",
      };
      if (kind === "xyz") {
        row.xiaoyuzhou_url = data.url;
        row.xiaoyuzhou_subscribers = s.subs;
        row.xiaoyuzhou_comments = s.comments;
        row.xiaoyuzhou_episode_count = s.episodeCount;
      } else {
        row.ximalaya_url = data.url;
        row.ximalaya_plays = s.plays;
        row.ximalaya_subscribers = s.subs;
        row.ximalaya_comments = s.comments;
      }

      const { data: pod, error } = await supabaseAdmin
        .from("podcasts")
        .upsert(row, { onConflict: conflictCol })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabaseAdmin.from("snapshots").insert({
        podcast_id: pod.id,
        episode_count: s.episodeCount ?? 0,
        xiaoyuzhou_subscribers: kind === "xyz" ? s.subs : null,
        ximalaya_plays: kind === "xmly" ? s.plays : null,
      });

      return { ok: true as const, podcastId: pod.id as string, platform: kind };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "导入失败",
        podcastId: null,
      };
    }
  });

// ---------- Cross-platform name search (Apple + Xiaoyuzhou + Ximalaya) ----------
export type SearchHit = {
  platform: "apple" | "xiaoyuzhou" | "ximalaya";
  id: string;
  title: string;
  author: string | null;
  url: string;
  feedUrl: string | null;
  artwork: string | null;
};

export const searchPodcastsAllPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(200),
        market: z.enum(["cn", "na"]).default("cn"),
        limit: z.number().int().min(1).max(10).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const results: SearchHit[] = [];
    const country = data.market === "na" ? "US" : "CN";

    try {
      const u = `https://itunes.apple.com/search?media=podcast&country=${country}&limit=${data.limit}&term=${encodeURIComponent(data.query)}`;
      const r = await fetch(u);
      if (r.ok) {
        const j = (await r.json()) as { results?: Array<Record<string, unknown>> };
        for (const it of j.results ?? []) {
          if (!it.feedUrl) continue;
          results.push({
            platform: "apple",
            id: String(it.collectionId ?? it.trackId ?? it.feedUrl),
            title: String(it.collectionName ?? it.trackName ?? "Unknown"),
            author: (it.artistName as string) ?? null,
            url: (it.collectionViewUrl as string) ?? (it.feedUrl as string),
            feedUrl: (it.feedUrl as string) ?? null,
            artwork: ((it.artworkUrl600 ?? it.artworkUrl100) as string) ?? null,
          });
        }
      }
    } catch (e) {
      console.error("apple search failed", e);
    }

    if (data.market === "cn") {
      try {
        const fc = getFirecrawl();
        const runSiteSearch = async (
          site: string,
          platform: "xiaoyuzhou" | "ximalaya",
        ) => {
          try {
            const sr = (await fc.search(`${data.query} site:${site}`, {
              limit: data.limit,
            })) as {
              web?: Array<{ url?: string; title?: string; description?: string }>;
              data?: Array<{ url?: string; title?: string; description?: string }>;
            };
            const items = sr.web ?? sr.data ?? [];
            for (const it of items) {
              if (!it.url) continue;
              const isHome =
                platform === "xiaoyuzhou"
                  ? /xiaoyuzhoufm\.com\/podcast\/[a-z0-9]+/i.test(it.url)
                  : /ximalaya\.com\/(album|podcast)\/\d+/i.test(it.url);
              if (!isHome) continue;
              const title = (it.title ?? "")
                .replace(/[\|\-–—]\s*(小宇宙|喜马拉雅|xiaoyuzhou|Ximalaya).*$/i, "")
                .trim();
              if (!title) continue;
              results.push({
                platform,
                id: it.url,
                title,
                author: null,
                url: it.url,
                feedUrl: null,
                artwork: null,
              });
            }
          } catch (e) {
            console.error(`${platform} search failed`, e);
          }
        };
        await runSiteSearch("xiaoyuzhoufm.com", "xiaoyuzhou");
        await runSiteSearch("ximalaya.com", "ximalaya");
      } catch (e) {
        console.error("firecrawl init failed", e);
      }
    }

    return { ok: true as const, results };
  });

// ---------- AI Ad Strategy ----------
type AdStrategy = {
  summary: string;
  audience_persona: string;
  best_ad_format: string;
  recommended_cpm_rmb: { min: number; max: number };
  best_episode_slot: string;
  do_list: string[];
  dont_list: string[];
  recommended_brands: Array<{
    name: string;
    category: string;
    fit_score: number;
    reason: string;
  }>;
};

export const generateAdStrategy = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ podcastId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,author,description,category,audience_tags,episode_count,update_frequency_days,avg_duration_minutes,commercial_score,activity_score,growth_score,lifecycle_stage,xiaoyuzhou_subscribers,ximalaya_plays",
      )
      .eq("id", data.podcastId)
      .single();
    if (error || !pod) throw new Error("播客不存在");

    const { data: eps } = await supabaseAdmin
      .from("episodes")
      .select("title")
      .eq("podcast_id", data.podcastId)
      .order("pub_date", { ascending: false })
      .limit(15);

    const prompt = `你是中文播客广告投放专家，为 MCN/广告主分析以下播客并给出投放建议。

【播客信息】
- 名称：${pod.title}
- 主理人：${pod.author ?? "未知"}
- 简介：${(pod.description ?? "").slice(0, 400)}
- 分类：${pod.category ?? "未分类"}
- 受众标签：${(pod.audience_tags ?? []).join("、") || "无"}
- 集数：${pod.episode_count}，平均时长：${pod.avg_duration_minutes ?? "?"} 分钟
- 更新频率：每 ${pod.update_frequency_days ?? "?"} 天
- 商业评分：${pod.commercial_score}，活跃度：${pod.activity_score}，增长性：${pod.growth_score}
- 生命周期阶段：${pod.lifecycle_stage}
- 小宇宙订阅数：${pod.xiaoyuzhou_subscribers ?? "未知"}
- 喜马拉雅播放量：${pod.ximalaya_plays ?? "未知"}

【最近 15 期标题】
${(eps ?? []).map((e, i) => `${i + 1}. ${e.title}`).join("\n")}

请严格按以下 JSON Schema 返回（不要任何额外文字、不要 markdown 代码块）：
{
  "summary": "一句话总结这档播客的投放价值",
  "audience_persona": "120 字以内的核心听众画像",
  "best_ad_format": "口播 / 中插 / 冠名 / 定制单集 中最适合的一种，并说明原因",
  "recommended_cpm_rmb": { "min": 数字, "max": 数字 },
  "best_episode_slot": "片头/中插/片尾 哪段最佳，并说明",
  "do_list": ["建议 1", "建议 2", "建议 3"],
  "dont_list": ["禁忌 1", "禁忌 2"],
  "recommended_brands": [
    { "name": "品牌中文名", "category": "品类", "fit_score": 1-100, "reason": "为什么匹配（30 字内）" }
  ]
}
要求推荐 6-8 个真实存在的、中国市场常见的品牌，覆盖不同品类，按 fit_score 降序。`;

    const raw = await callLovableAI(
      [
        { role: "system", content: "你是资深中文播客广告策略顾问，只输出严格 JSON。" },
        { role: "user", content: prompt },
      ],
      { json: true },
    );
    const parsed = safeParseJson(raw) as AdStrategy | null;
    if (!parsed) throw new Error("AI 返回格式无法解析");

    await supabaseAdmin
      .from("podcasts")
      .update({
        ai_strategy: parsed as unknown as never,
        ai_strategy_at: new Date().toISOString(),
      })
      .eq("id", data.podcastId);

    // Save brand recommendations (replace existing)
    await supabaseAdmin
      .from("brand_recommendations")
      .delete()
      .eq("podcast_id", data.podcastId);

    if (parsed.recommended_brands?.length) {
      await supabaseAdmin.from("brand_recommendations").insert(
        parsed.recommended_brands.map((b) => ({
          podcast_id: data.podcastId,
          brand_name: b.name,
          category: b.category,
          fit_score: b.fit_score,
          reason: b.reason,
        })),
      );
    }

    return { ok: true, strategy: parsed };
  });

// ---------- Brand contact lookup via Firecrawl ----------
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BD_HINTS = ["bd@", "biz@", "business@", "marketing@", "pr@", "media@", "cooperation@", "contact@", "hello@"];

function pickBestEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  const filtered = emails.filter(
    (e) =>
      !/example\.com|sentry\.io|wixpress|@2x|\.png|\.jpg|noreply|no-reply/i.test(e),
  );
  const list = filtered.length ? filtered : emails;
  for (const hint of BD_HINTS) {
    const found = list.find((e) => e.toLowerCase().startsWith(hint));
    if (found) return found;
  }
  return list[0];
}

export const findBrandContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        brandRecommendationId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: brand, error } = await supabaseAdmin
      .from("brand_recommendations")
      .select("id,brand_name")
      .eq("id", data.brandRecommendationId)
      .single();
    if (error || !brand) throw new Error("品牌不存在");

    const key = brand.brand_name.trim().toLowerCase();
    const { data: cached } = await supabaseAdmin
      .from("brand_contacts_cache")
      .select("*")
      .eq("brand_key", key)
      .maybeSingle();

    let website: string | null = cached?.website ?? null;
    let email: string | null = cached?.contact_email ?? null;
    let notes: string | null = cached?.notes ?? null;

    if (!cached) {
      const fc = getFirecrawl();
      try {
        const searchRes = (await fc.search(`${brand.brand_name} 官网 商务合作 联系邮箱`, {
          limit: 5,
        })) as { web?: Array<{ url?: string; title?: string; description?: string }> } & {
          data?: Array<{ url?: string; title?: string; description?: string }>;
        };
        const items = searchRes.web ?? searchRes.data ?? [];
        const officialItem =
          items.find(
            (it) =>
              it.url &&
              !/zhihu|baike|baidu|xiaohongshu|weibo|douyin|bilibili|wikipedia|tianyancha|qichacha/i.test(
                it.url,
              ),
          ) ?? items[0];
        website = officialItem?.url ?? null;

        const haystacks: string[] = [];
        for (const it of items.slice(0, 3)) {
          if (it.description) haystacks.push(it.description);
          if (it.title) haystacks.push(it.title);
        }

        if (website) {
          try {
            const scraped = (await fc.scrape(website, {
              formats: ["markdown"],
              onlyMainContent: false,
            })) as { markdown?: string };
            if (scraped.markdown) haystacks.push(scraped.markdown);
          } catch (e) {
            console.error("brand site scrape failed", e);
          }
        }

        const allText = haystacks.join("\n");
        const emails = Array.from(new Set(allText.match(EMAIL_RE) ?? []));
        email = pickBestEmail(emails);
        notes = email
          ? "Firecrawl 自动抓取，建议人工二次确认"
          : "未在公开页面找到邮箱，建议查看官网底部或联系页面";

        await supabaseAdmin.from("brand_contacts_cache").upsert({
          brand_key: key,
          brand_name: brand.brand_name,
          website,
          contact_email: email,
          notes,
          raw: { emails } as unknown as never,
          fetched_at: new Date().toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "查询失败";
        throw new Error(`Firecrawl 查询失败：${msg}`);
      }
    }

    await supabaseAdmin
      .from("brand_recommendations")
      .update({
        website,
        contact_email: email,
        contact_notes: notes,
        contacts_fetched_at: new Date().toISOString(),
      })
      .eq("id", brand.id);

    return { website, email, notes };
  });

// ---------- Get brand recommendations ----------
export const listBrandRecommendations = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ podcastId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("brand_recommendations")
      .select("*")
      .eq("podcast_id", data.podcastId)
      .order("fit_score", { ascending: false });
    if (error) throw new Error(error.message);
    return { brands: rows ?? [] };
  });

// ---------- Campaign Planner (GPT-5) ----------
export const planCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        brandName: z.string().trim().min(1).max(200),
        productDescription: z.string().trim().min(5).max(2000),
        goal: z.string().trim().min(1).max(100),
        budgetRmb: z.number().min(1000).max(100_000_000),
        targetTier: z.enum(["头部", "腰部", "长尾", "混合"]),
        audienceNotes: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Pull top candidate podcasts to ground the AI in real inventory
    const { data: pods } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,author,category,audience_tags,commercial_score,activity_score,growth_score,lifecycle_stage,update_frequency_days,xiaoyuzhou_subscribers,ximalaya_plays",
      )
      .eq("market", "cn")
      .order("commercial_score", { ascending: false })
      .limit(40);

    const tierFilter = (p: NonNullable<typeof pods>[number]) => {
      const subs = p.xiaoyuzhou_subscribers ?? 0;
      if (data.targetTier === "头部") return subs >= 50000 || (p.commercial_score ?? 0) >= 80;
      if (data.targetTier === "腰部")
        return (subs >= 5000 && subs < 50000) || ((p.commercial_score ?? 0) >= 60 && (p.commercial_score ?? 0) < 80);
      if (data.targetTier === "长尾") return subs < 5000 && (p.commercial_score ?? 0) < 60;
      return true;
    };

    const candidates = (pods ?? []).filter(tierFilter).slice(0, 20);
    const inventoryText = candidates
      .map(
        (p, i) =>
          `${i + 1}. [${p.id.slice(0, 8)}] ${p.title}｜${p.category ?? "未分类"}｜标签：${(p.audience_tags ?? []).slice(0, 4).join("/") || "无"}｜商业${p.commercial_score}/活跃${p.activity_score}/增长${p.growth_score}｜${p.lifecycle_stage ?? "?"}｜订阅 ${p.xiaoyuzhou_subscribers ?? "?"}`,
      )
      .join("\n");

    const prompt = `你是一位资深中文播客广告投放规划师，正在为以下品牌做投放方案规划。

【品牌信息】
- 品牌：${data.brandName}
- 产品描述：${data.productDescription}
- 投放目的：${data.goal}
- 预算（人民币）：¥${data.budgetRmb.toLocaleString()}
- 目标层级：${data.targetTier}
${data.audienceNotes ? `- 目标人群补充：${data.audienceNotes}` : ""}

【当前可投放播客库存 Top ${candidates.length}】
${inventoryText || "（暂无符合层级的播客，请给出通用建议）"}

请基于上述真实库存，规划完整投放方案。严格按以下 JSON Schema 返回（不要任何额外文字或 markdown）：
{
  "strategy_summary": "120 字以内的整体策略概述",
  "recommended_format": "推荐的主投形式（口播/中插/冠名/定制单集）及原因",
  "budget_allocation": [
    { "bucket": "类别名（如：腰部口播 / 头部冠名 / 测试单集）", "amount_rmb": 数字, "percentage": 数字, "rationale": "原因（30字内）" }
  ],
  "selected_podcasts": [
    { "podcast_id": "上方库存的完整 UUID", "title": "播客名", "suggested_format": "口播/中插/冠名", "estimated_cpm_rmb": 数字, "estimated_episodes": 数字, "expected_reach": 数字, "fit_reason": "为什么选它（30字内）" }
  ],
  "kpi_forecast": {
    "total_reach": 数字,
    "estimated_clicks": 数字,
    "estimated_conversions": 数字,
    "estimated_cpa_rmb": 数字
  },
  "timeline_weeks": 数字,
  "risk_warnings": ["风险点 1", "风险点 2"],
  "next_steps": ["下一步 1", "下一步 2", "下一步 3"]
}
要求：
- selected_podcasts 必须从上方库存中选择，podcast_id 用上方括号中标注的前缀去匹配，但返回完整 UUID（从上方原文复制）。若库存为空可省略此字段或返回空数组。
- budget_allocation 总和应等于总预算。
- 所有金额按人民币元。`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY 未配置");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: "你是中文播客广告投放规划专家，只输出严格 JSON。" },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
    if (res.status === 402) throw new Error("AI 额度已用尽，请在 Settings → Usage 添加额度");
    if (!res.ok) throw new Error(`AI 调用失败：${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("AI 返回格式无法解析");

    return {
      plan: parsed,
      inventorySize: candidates.length,
      model: "openai/gpt-5-mini",
    };
  });

// ============================================================
// ============ OVERSEAS (NA / English) MODULE ================
// ============================================================

// ---------- AI Ad Strategy for North-American English podcasts ----------
type OverseasStrategy = {
  summary: string;
  audience_persona: string;
  best_ad_format: string;
  recommended_cpm_usd: { min: number; max: number };
  best_episode_slot: string;
  do_list: string[];
  dont_list: string[];
  cross_border_brand_fit: string;
  recommended_brands: Array<{
    name: string;
    category: string;
    fit_score: number;
    reason: string;
  }>;
};

export const generateOverseasStrategy = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ podcastId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,author,description,category,audience_tags,episode_count,update_frequency_days,avg_duration_minutes,commercial_score,activity_score,growth_score,lifecycle_stage,language,itunes_url",
      )
      .eq("id", data.podcastId)
      .single();
    if (error || !pod) throw new Error("Podcast not found");

    const { data: eps } = await supabaseAdmin
      .from("episodes")
      .select("title")
      .eq("podcast_id", data.podcastId)
      .order("pub_date", { ascending: false })
      .limit(15);

    const prompt = `You are a senior podcast advertising strategist focused on the North-American (US/Canada) English podcast market, advising Chinese cross-border (DTC / consumer / app / SaaS) brands looking to expand overseas.

[Podcast]
- Title: ${pod.title}
- Host: ${pod.author ?? "unknown"}
- Description: ${(pod.description ?? "").slice(0, 500)}
- Category: ${pod.category ?? "uncategorized"}
- Audience tags: ${(pod.audience_tags ?? []).join(", ") || "n/a"}
- Episodes: ${pod.episode_count}, avg duration: ${pod.avg_duration_minutes ?? "?"} min
- Update frequency: every ${pod.update_frequency_days ?? "?"} days
- Scores: commercial ${pod.commercial_score} / activity ${pod.activity_score} / growth ${pod.growth_score}
- Lifecycle: ${pod.lifecycle_stage}
- Language: ${pod.language ?? "en"}
- Apple URL: ${pod.itunes_url ?? "n/a"}

[Last 15 episode titles]
${(eps ?? []).map((e, i) => `${i + 1}. ${e.title}`).join("\n")}

Return strict JSON (no markdown, no extra text) matching:
{
  "summary": "one-sentence ad-investment thesis",
  "audience_persona": "<=140 chars describing the core US/Canada listener persona",
  "best_ad_format": "host-read / mid-roll / pre-roll / branded segment — pick one with reason",
  "recommended_cpm_usd": { "min": number, "max": number },
  "best_episode_slot": "pre-roll / mid-roll / post-roll — pick best with reason",
  "do_list": ["do 1", "do 2", "do 3"],
  "dont_list": ["dont 1", "dont 2"],
  "cross_border_brand_fit": "<=140 chars: which kind of Chinese cross-border brand best fits this show (e.g. SHEIN-style fast fashion, Anker-style consumer electronics, TikTok Shop sellers, Temu DTC, gaming apps)",
  "recommended_brands": [
    { "name": "real Chinese cross-border brand name (English or pinyin)", "category": "category", "fit_score": 1-100, "reason": "<=30 words why it fits" }
  ]
}
Recommend 6-8 real Chinese cross-border / global brands (e.g. SHEIN, Anker, Temu, DJI, Insta360, Cider, Lenovo, Hisense, Xiaomi, Yeedi, Roborock, BYD, MiHoYo, ByteDance/TikTok apps, SHEGLAM, Ulike, Laifen) sorted by fit_score desc.`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: "You are a senior US podcast ad strategist. Output strict JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate-limited, please retry shortly");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Usage");
    if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(raw) as OverseasStrategy | null;
    if (!parsed) throw new Error("AI returned unparsable JSON");

    await supabaseAdmin
      .from("podcasts")
      .update({
        ai_strategy: parsed as unknown as never,
        ai_strategy_at: new Date().toISOString(),
      })
      .eq("id", data.podcastId);

    await supabaseAdmin
      .from("brand_recommendations")
      .delete()
      .eq("podcast_id", data.podcastId);

    if (parsed.recommended_brands?.length) {
      await supabaseAdmin.from("brand_recommendations").insert(
        parsed.recommended_brands.map((b) => ({
          podcast_id: data.podcastId,
          brand_name: b.name,
          category: b.category,
          fit_score: b.fit_score,
          reason: b.reason,
        })),
      );
    }

    return { ok: true, strategy: parsed };
  });

// ---------- Cross-Border Campaign Planner (GPT-5, English NA inventory) ----------
export const planCrossBorderCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        brandName: z.string().trim().min(1).max(200),
        productDescription: z.string().trim().min(5).max(2000),
        goal: z.string().trim().min(1).max(100),
        budgetUsd: z.number().min(500).max(10_000_000),
        targetTier: z.enum(["top", "mid", "long-tail", "mixed"]),
        targetRegion: z.string().trim().max(200).optional().nullable(),
        audienceNotes: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: pods } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,author,category,audience_tags,commercial_score,activity_score,growth_score,lifecycle_stage,update_frequency_days,language,description",
      )
      .eq("market", "na")
      .order("commercial_score", { ascending: false })
      .limit(40);

    const tierFilter = (p: NonNullable<typeof pods>[number]) => {
      const c = p.commercial_score ?? 0;
      if (data.targetTier === "top") return c >= 80;
      if (data.targetTier === "mid") return c >= 55 && c < 80;
      if (data.targetTier === "long-tail") return c < 55;
      return true;
    };

    const candidates = (pods ?? []).filter(tierFilter).slice(0, 20);
    const inventoryText = candidates
      .map(
        (p, i) =>
          `${i + 1}. [${p.id.slice(0, 8)}] ${p.title} | ${p.category ?? "uncategorized"} | tags: ${(p.audience_tags ?? []).slice(0, 4).join("/") || "none"} | scores C${p.commercial_score}/A${p.activity_score}/G${p.growth_score} | ${p.lifecycle_stage ?? "?"}`,
      )
      .join("\n");

    const prompt = `You are a senior cross-border podcast advertising strategist. A Chinese brand is planning to advertise on North-American English podcasts to expand overseas.

[Brand]
- Brand: ${data.brandName}
- Product: ${data.productDescription}
- Goal: ${data.goal}
- Budget (USD): $${data.budgetUsd.toLocaleString()}
- Target tier: ${data.targetTier}
${data.targetRegion ? `- Target region: ${data.targetRegion}` : "- Target region: US/Canada"}
${data.audienceNotes ? `- Audience notes: ${data.audienceNotes}` : ""}

[Available NA podcast inventory — top ${candidates.length}]
${inventoryText || "(inventory is empty — give general guidance only)"}

Return strict JSON (no markdown, no extra text):
{
  "strategy_summary": "<=180 chars overall strategy",
  "recommended_format": "host-read / mid-roll / branded segment — pick one with rationale",
  "cultural_localization_tips": ["tip 1", "tip 2", "tip 3"],
  "budget_allocation": [
    { "bucket": "e.g. Mid-tier host-read / Top branded / Test pilot", "amount_usd": number, "percentage": number, "rationale": "<=30 words" }
  ],
  "selected_podcasts": [
    { "podcast_id": "full UUID from inventory above", "title": "title", "suggested_format": "host-read/mid-roll/branded", "estimated_cpm_usd": number, "estimated_episodes": number, "expected_reach": number, "fit_reason": "<=30 words" }
  ],
  "kpi_forecast": {
    "total_reach": number,
    "estimated_clicks": number,
    "estimated_conversions": number,
    "estimated_cpa_usd": number
  },
  "timeline_weeks": number,
  "risk_warnings": ["risk 1", "risk 2"],
  "next_steps": ["step 1", "step 2", "step 3"]
}
Rules:
- selected_podcasts must come from the inventory above; return the full UUID.
- Total budget_allocation amounts should equal the total budget.
- All amounts in USD.
- Tailor cultural_localization_tips specifically to a Chinese brand entering NA (brand naming, claims, voice/accent, FTC disclosure).`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: "You are a cross-border podcast ad strategist. Output strict JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate-limited, please retry shortly");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Usage");
    if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("AI returned unparsable JSON");

    return {
      plan: parsed,
      inventorySize: candidates.length,
      model: "openai/gpt-5-mini",
    };
  });
