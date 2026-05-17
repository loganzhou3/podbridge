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
        model: "openai/gpt-5",
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
      model: "openai/gpt-5",
    };
  });
