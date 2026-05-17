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

export const scrapePodcastPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ podcastId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .select("id,xiaoyuzhou_url,ximalaya_url")
      .eq("id", data.podcastId)
      .single();
    if (error || !pod) throw new Error("播客不存在");
    if (!pod.xiaoyuzhou_url && !pod.ximalaya_url) {
      throw new Error("请先填写小宇宙或喜马拉雅链接");
    }

    const fc = getFirecrawl();
    let xiaoyuzhouSubs: number | null = null;
    let ximalayaPlays: number | null = null;

    if (pod.xiaoyuzhou_url) {
      try {
        const r = await fc.scrape(pod.xiaoyuzhou_url, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const md = (r as { markdown?: string }).markdown ?? "";
        xiaoyuzhouSubs = extractNumber(md, [
          /([\d.,]+\s*[万亿]?)\s*(?:订阅|关注)/,
          /(?:订阅|关注)\s*[:：]?\s*([\d.,]+\s*[万亿]?)/,
        ]);
      } catch (e) {
        console.error("xiaoyuzhou scrape failed", e);
      }
    }

    if (pod.ximalaya_url) {
      try {
        const r = await fc.scrape(pod.ximalaya_url, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const md = (r as { markdown?: string }).markdown ?? "";
        ximalayaPlays = extractNumber(md, [
          /([\d.,]+\s*[万亿]?)\s*(?:播放|次播放)/,
          /(?:播放量|总播放)\s*[:：]?\s*([\d.,]+\s*[万亿]?)/,
        ]);
      } catch (e) {
        console.error("ximalaya scrape failed", e);
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("podcasts")
      .update({
        xiaoyuzhou_subscribers: xiaoyuzhouSubs,
        ximalaya_plays: ximalayaPlays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.podcastId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, xiaoyuzhouSubs, ximalayaPlays };
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
        ai_strategy: parsed as unknown as object,
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
          raw: { emails } as unknown as object,
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
