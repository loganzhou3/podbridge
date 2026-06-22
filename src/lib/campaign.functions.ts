import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAi, planCampaign } from "@/lib/insights.functions";
import type { Json } from "@/integrations/supabase/types";

const tierSchema = z.enum(["头部", "腰部", "长尾", "混合"]);

const briefSchema = z.object({
  brandName: z.string().trim().min(1).max(200),
  productDescription: z.string().trim().min(5).max(3000),
  goal: z.string().trim().min(1).max(200),
  budgetRmb: z.number().int().min(1000).max(100_000_000),
  targetTier: tierSchema.default("混合"),
  audienceNotes: z.string().trim().max(1000).optional().nullable(),
  flightStart: z.string().trim().max(20).optional().nullable(),
  flightEnd: z.string().trim().max(20).optional().nullable(),
});

type SelectedPodcast = {
  podcast_id?: string;
  title?: string;
  suggested_format?: string;
  estimated_cpm_rmb?: number;
  estimated_episodes?: number;
  expected_reach?: number;
  fit_reason?: string;
};

type ScenarioPlan = {
  plan_label?: string;
  selected_podcasts?: SelectedPodcast[];
};

type CampaignPlan = {
  scenario_plans?: ScenarioPlan[];
  selected_podcasts?: SelectedPodcast[];
  [key: string]: unknown;
};

const pipelineSchema = z.enum([
  "candidate",
  "contacted",
  "quoted",
  "confirmed",
  "live",
  "reviewed",
]);

const confidenceSchema = z.enum(["public_data", "ai_estimated", "creator_authorized", "manual_confirmed"]);

type PodcastSignal = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  commercial_score: number | null;
  activity_score: number | null;
  growth_score: number | null;
  update_frequency_days: number | null;
  episode_count: number | null;
  xiaoyuzhou_url: string | null;
  ximalaya_url: string | null;
  itunes_url: string | null;
  xiaoyuzhou_subscribers: number | null;
  ximalaya_subscribers: number | null;
  apple_subscribers: number | null;
  ximalaya_plays: number | null;
  latest_episode_at: string | null;
  audience_tags: string[] | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundToHundred(n: number) {
  return Math.max(300, Math.round(n / 100) * 100);
}

function totalSubscribers(podcast?: PodcastSignal | null) {
  if (!podcast) return 0;
  return Math.max(
    podcast.xiaoyuzhou_subscribers ?? 0,
    podcast.ximalaya_subscribers ?? 0,
    podcast.apple_subscribers ?? 0,
    podcast.ximalaya_plays ? Math.round(podcast.ximalaya_plays / 80) : 0,
  );
}

function estimatePricing(podcast?: PodcastSignal | null, selected?: SelectedPodcast) {
  const score =
    (podcast?.commercial_score ?? 55) * 0.42 +
    (podcast?.activity_score ?? 55) * 0.28 +
    (podcast?.growth_score ?? 50) * 0.18;
  const coverage =
    (podcast?.xiaoyuzhou_url ? 1 : 0) + (podcast?.ximalaya_url ? 1 : 0) + (podcast?.itunes_url ? 1 : 0);
  const subs = totalSubscribers(podcast);
  const reach = selected?.expected_reach ?? Math.max(1200, Math.round(subs * 0.18));
  const cpm = selected?.estimated_cpm_rmb ?? clamp(Math.round(65 + score * 1.15 + coverage * 18), 80, 260);
  const raw = (reach / 1000) * cpm;
  const heatBoost = /商业|科技|AI|创业|财经|职场/.test(`${podcast?.category ?? ""} ${(podcast?.audience_tags ?? []).join(" ")}`)
    ? 1.18
    : 1;
  const midpoint = roundToHundred(raw * heatBoost);
  const min = roundToHundred(midpoint * 0.75);
  const max = roundToHundred(midpoint * 1.35);
  return {
    min,
    max: Math.max(max, min + 300),
    basis: `按预估触达 ${reach.toLocaleString()}、CPM ¥${cpm}、商业评分 ${Math.round(score)}、平台覆盖 ${coverage || 1} 个估算`,
  };
}

function assessBrandSafety(podcast?: PodcastSignal | null) {
  const text = `${podcast?.title ?? ""} ${podcast?.category ?? ""} ${podcast?.description ?? ""} ${(podcast?.audience_tags ?? []).join(" ")}`;
  const tags: string[] = [];
  let score = 88;
  const patterns: Array<[RegExp, string, number]> = [
    [/政治|时政|国际关系|社会事件|公共议题|敏感/i, "政治敏感", 18],
    [/低俗|成人|情色|猎奇|擦边|暴力|犯罪/i, "低俗/成人内容", 22],
    [/争议|骂战|爆料|立场|阴谋|极端/i, "争议话题", 14],
    [/带货|广告|招商|商务合作|课程|社群|训练营/i, "商业化较强", 8],
  ];
  for (const [pattern, tag, penalty] of patterns) {
    if (pattern.test(text)) {
      tags.push(tag);
      score -= penalty;
    }
  }
  if (podcast?.update_frequency_days && podcast.update_frequency_days > 21) {
    tags.push("更新不稳定");
    score -= 12;
  }
  if (podcast?.latest_episode_at) {
    const days = (Date.now() - new Date(podcast.latest_episode_at).getTime()) / 86400000;
    if (days > 45) {
      tags.push("近期活跃不足");
      score -= 10;
    }
  }
  if (!tags.length) tags.push("未见明显风险");
  return {
    score: clamp(Math.round(score), 35, 96),
    tags: Array.from(new Set(tags)).slice(0, 5),
    notes: tags.includes("未见明显风险")
      ? "基于节目标题、简介、垂类、更新频率的初步判断，未发现明显品牌安全风险。"
      : "基于节目标题、简介、垂类、更新频率的初步判断，投放前建议人工复核相关单集。",
  };
}

function buildMatchExplanation(brief: { brand_name: string; product_description: string; goal: string; audience_notes: string | null }, podcast?: PodcastSignal | null, selected?: SelectedPodcast) {
  const tagText = (podcast?.audience_tags ?? []).slice(0, 3).join("、");
  const category = podcast?.category || "泛内容";
  const fit = selected?.fit_reason || "受众与品牌需求存在基础匹配";
  return `${podcast?.title ?? selected?.title ?? "该节目"}属于${category}，${tagText ? `核心标签为${tagText}，` : ""}适合${brief.brand_name}围绕“${brief.goal}”做${selected?.suggested_format ?? "口播/中插"}；推荐依据：${fit}。`;
}

function confidenceForPodcast(podcast?: PodcastSignal | null) {
  const hasPlatform = Boolean(podcast?.xiaoyuzhou_url || podcast?.ximalaya_url || podcast?.itunes_url);
  const hasPublicMetrics = Boolean(
    podcast?.xiaoyuzhou_subscribers || podcast?.ximalaya_subscribers || podcast?.ximalaya_plays || podcast?.apple_subscribers,
  );
  if (hasPlatform && hasPublicMetrics) return "public_data";
  return "ai_estimated";
}

function splitList(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export const createBrandBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => briefSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: brief, error } = await supabaseAdmin
      .from("brand_briefs")
      .insert({
        brand_name: data.brandName,
        product_description: data.productDescription,
        goal: data.goal,
        budget_rmb: data.budgetRmb,
        target_tier: data.targetTier,
        audience_notes: data.audienceNotes || null,
        flight_start: data.flightStart || null,
        flight_end: data.flightEnd || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { brief };
  });

export const listBriefsAndCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const [briefsRes, campaignsRes] = await Promise.all([
    supabaseAdmin.from("brand_briefs").select("*").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("campaigns").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  if (briefsRes.error) throw new Error(briefsRes.error.message);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);
  return { briefs: briefsRes.data ?? [], campaigns: campaignsRes.data ?? [] };
});

function extractCampaignPodcasts(plan: CampaignPlan) {
  const rows: Array<SelectedPodcast & { plan_label: string; sort_order: number }> = [];
  const scenarios = Array.isArray(plan.scenario_plans) ? plan.scenario_plans : [];
  if (scenarios.length) {
    scenarios.forEach((scenario, scenarioIndex) => {
      const label = scenario.plan_label || `Plan ${String.fromCharCode(65 + scenarioIndex)}`;
      (scenario.selected_podcasts ?? []).forEach((podcast, podcastIndex) => {
        rows.push({
          ...podcast,
          plan_label: label,
          sort_order: scenarioIndex * 100 + podcastIndex,
        });
      });
    });
    return rows;
  }
  (plan.selected_podcasts ?? []).forEach((podcast, index) => {
    rows.push({ ...podcast, plan_label: "Plan B", sort_order: index });
  });
  return rows;
}

export const generateCampaignFromBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ briefId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: brief, error } = await supabaseAdmin
      .from("brand_briefs")
      .select("*")
      .eq("id", data.briefId)
      .single();
    if (error || !brief) throw new Error(error?.message ?? "品牌需求不存在");

    const generated = await planCampaign({
      data: {
        brandName: brief.brand_name,
        productDescription: brief.product_description,
        goal: brief.goal,
        budgetRmb: brief.budget_rmb,
        targetTier: tierSchema.parse(brief.target_tier),
        audienceNotes: brief.audience_notes,
      },
    });
    const plan = generated.plan as CampaignPlan;
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .insert({
        brief_id: brief.id,
        name: `${brief.brand_name}｜${brief.goal}`,
        status: "planning",
        plan: plan as Json,
      })
      .select("*")
      .single();
    if (campaignError) throw new Error(campaignError.message);

    const extractedPodcasts = extractCampaignPodcasts(plan);
    const podcastIds = Array.from(
      new Set(extractedPodcasts.map((podcast) => podcast.podcast_id).filter((id): id is string => Boolean(id))),
    );
    const podcastSignals = podcastIds.length
      ? await supabaseAdmin
          .from("podcasts")
          .select(
            "id,title,category,description,commercial_score,activity_score,growth_score,update_frequency_days,episode_count,xiaoyuzhou_url,ximalaya_url,itunes_url,xiaoyuzhou_subscribers,ximalaya_subscribers,apple_subscribers,ximalaya_plays,latest_episode_at,audience_tags",
          )
          .in("id", podcastIds)
      : { data: [] as PodcastSignal[], error: null };
    if (podcastSignals.error) throw new Error(podcastSignals.error.message);
    const signalById = new Map((podcastSignals.data ?? []).map((podcast) => [podcast.id, podcast as PodcastSignal]));

    const podcastRows = extractedPodcasts.map((podcast) => {
      const signal = podcast.podcast_id ? signalById.get(podcast.podcast_id) : null;
      const price = estimatePricing(signal, podcast);
      const safety = assessBrandSafety(signal);
      const confidence = confidenceForPodcast(signal);
      return {
      campaign_id: campaign.id,
      podcast_id: podcast.podcast_id || null,
      plan_label: podcast.plan_label,
      title: podcast.title || "未命名播客",
      suggested_format: podcast.suggested_format || null,
      estimated_cpm_rmb: podcast.estimated_cpm_rmb ?? null,
      estimated_episodes: podcast.estimated_episodes ?? null,
      expected_reach: podcast.expected_reach ?? null,
      fit_reason: podcast.fit_reason || null,
      match_explanation: buildMatchExplanation(brief, signal, podcast),
      pipeline_status: "candidate",
      brand_safety_score: safety.score,
      brand_safety_tags: safety.tags,
      brand_safety_notes: safety.notes,
      suggested_price_min_rmb: price.min,
      suggested_price_max_rmb: price.max,
      pricing_basis: price.basis,
      data_confidence: confidence,
      competitor_brands: [],
      sort_order: podcast.sort_order,
    };
    });
    if (podcastRows.length) {
      const { error: podError } = await supabaseAdmin.from("campaign_podcasts").insert(podcastRows);
      if (podError) throw new Error(podError.message);

      const profileRows = podcastRows
        .filter((row) => row.podcast_id)
        .map((row) => ({
          podcast_id: row.podcast_id as string,
          collaboration_status: "candidate",
          brand_safety_score: row.brand_safety_score ?? 80,
          brand_safety_tags: row.brand_safety_tags ?? [],
          brand_safety_notes: row.brand_safety_notes ?? null,
          suggested_price_min_rmb: row.suggested_price_min_rmb,
          suggested_price_max_rmb: row.suggested_price_max_rmb,
          pricing_basis: row.pricing_basis,
          data_confidence: row.data_confidence,
          source_notes: "由投放方案生成时按公开指标和AI规则估算",
          updated_at: new Date().toISOString(),
        }));
      if (profileRows.length) {
        await supabaseAdmin.from("podcast_ad_profiles").upsert(profileRows, {
          onConflict: "podcast_id",
        });
      }

      const contactRows = podcastRows
        .filter((row) => row.podcast_id)
        .map((row) => ({
          podcast_id: row.podcast_id,
          platform: "podcast",
          profile_url: null,
          status: "unknown",
          notes: "投放管理自动创建，待补充联系方式",
        }));
      if (contactRows.length) {
        await supabaseAdmin.from("creator_contacts").upsert(contactRows, {
          onConflict: "podcast_id,platform,profile_url",
        });
      }
    }

    await supabaseAdmin
      .from("brand_briefs")
      .update({ status: "planned", updated_at: new Date().toISOString() })
      .eq("id", brief.id);

    return { campaignId: campaign.id, plan };
  });

export const getCampaignDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [campaignRes, podsRes] = await Promise.all([
      supabaseAdmin.from("campaigns").select("*").eq("id", data.campaignId).single(),
      supabaseAdmin
        .from("campaign_podcasts")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .order("sort_order", { ascending: true }),
    ]);
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    if (podsRes.error) throw new Error(podsRes.error.message);
    const brief = campaignRes.data.brief_id
      ? await supabaseAdmin.from("brand_briefs").select("*").eq("id", campaignRes.data.brief_id).maybeSingle()
      : null;
    const podcastIds = Array.from(
      new Set((podsRes.data ?? []).map((row) => row.podcast_id).filter((id): id is string => Boolean(id))),
    );
    const [profilesRes, contactsRes, competitorsRes] = podcastIds.length
      ? await Promise.all([
          supabaseAdmin.from("podcast_ad_profiles").select("*").in("podcast_id", podcastIds),
          supabaseAdmin.from("creator_contacts").select("*").in("podcast_id", podcastIds),
          supabaseAdmin
            .from("competitor_campaigns")
            .select("*")
            .in("podcast_id", podcastIds)
            .order("last_seen_at", { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (profilesRes.error) console.warn("[campaign] podcast_ad_profiles unavailable", profilesRes.error.message);
    if (contactsRes.error) throw new Error(contactsRes.error.message);
    if (competitorsRes.error) console.warn("[campaign] competitor_campaigns unavailable", competitorsRes.error.message);
    return {
      campaign: campaignRes.data,
      brief: brief && !brief.error ? brief.data : null,
      podcasts: podsRes.data ?? [],
      adProfiles: profilesRes.error ? [] : (profilesRes.data ?? []),
      contacts: contactsRes.data ?? [],
      competitors: competitorsRes.error ? [] : (competitorsRes.data ?? []),
    };
  });

export const updateCampaignPodcast = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        outreachStatus: z
          .enum(["not_contacted", "contact_found", "contacted", "replied", "quoted", "scheduled", "rejected", "done"])
          .optional(),
        pipelineStatus: pipelineSchema.optional(),
        quotedPriceRmb: z.number().int().min(0).nullable().optional(),
        scheduledDate: z.string().trim().max(20).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const updates = {
      ...(data.outreachStatus ? { outreach_status: data.outreachStatus } : {}),
      ...(data.pipelineStatus ? { pipeline_status: data.pipelineStatus } : {}),
      ...(data.quotedPriceRmb !== undefined ? { quoted_price_rmb: data.quotedPriceRmb } : {}),
      ...(data.scheduledDate !== undefined ? { scheduled_date: data.scheduledDate || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("campaign_podcasts").update(updates).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPodcastToCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        podcastId: z.string().uuid(),
        planLabel: z.string().trim().max(40).default("手动加入"),
        suggestedFormat: z.string().trim().max(120).nullable().optional(),
        fitReason: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .single();
    if (campaignError || !campaign) throw new Error(campaignError?.message ?? "投放项目不存在");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("campaign_podcasts")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("podcast_id", data.podcastId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.id) return { ok: true, duplicated: true, campaignPodcastId: existing.id };

    const { data: briefRes } = campaign.brief_id
      ? await supabaseAdmin.from("brand_briefs").select("*").eq("id", campaign.brief_id).maybeSingle()
      : { data: null };
    const { data: podcast, error: podcastError } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,category,description,commercial_score,activity_score,growth_score,update_frequency_days,episode_count,xiaoyuzhou_url,ximalaya_url,itunes_url,xiaoyuzhou_subscribers,ximalaya_subscribers,apple_subscribers,ximalaya_plays,latest_episode_at,audience_tags",
      )
      .eq("id", data.podcastId)
      .single();
    if (podcastError || !podcast) throw new Error(podcastError?.message ?? "播客不存在");

    const signal = podcast as PodcastSignal;
    const selected: SelectedPodcast = {
      podcast_id: signal.id,
      title: signal.title ?? "未命名播客",
      suggested_format: data.suggestedFormat || "口播/中插",
      estimated_cpm_rmb: estimatePricing(signal).basis.match(/CPM ¥(\d+)/)?.[1]
        ? Number(estimatePricing(signal).basis.match(/CPM ¥(\d+)/)?.[1])
        : undefined,
      expected_reach: Math.max(1200, Math.round(totalSubscribers(signal) * 0.18)),
      fit_reason: data.fitReason || "从今日建议建联加入，适合进入人工询价与小预算测试。",
    };
    const price = estimatePricing(signal, selected);
    const safety = assessBrandSafety(signal);
    const confidence = confidenceForPodcast(signal);
    const brief =
      briefRes ??
      ({
        brand_name: "当前品牌",
        product_description: "",
        goal: "投放测试",
        audience_notes: null,
      } as const);
    const { data: maxSort } = await supabaseAdmin
      .from("campaign_podcasts")
      .select("sort_order")
      .eq("campaign_id", data.campaignId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("campaign_podcasts")
      .insert({
        campaign_id: data.campaignId,
        podcast_id: signal.id,
        plan_label: data.planLabel || "手动加入",
        title: signal.title || "未命名播客",
        suggested_format: selected.suggested_format,
        estimated_cpm_rmb: selected.estimated_cpm_rmb ?? null,
        estimated_episodes: 1,
        expected_reach: selected.expected_reach ?? null,
        fit_reason: selected.fit_reason,
        match_explanation: buildMatchExplanation(brief, signal, selected),
        outreach_status: "not_contacted",
        pipeline_status: "candidate",
        brand_safety_score: safety.score,
        brand_safety_tags: safety.tags,
        brand_safety_notes: safety.notes,
        suggested_price_min_rmb: price.min,
        suggested_price_max_rmb: price.max,
        pricing_basis: price.basis,
        data_confidence: confidence,
        competitor_brands: [],
        sort_order: (maxSort?.sort_order ?? 0) + 1,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin.from("podcast_ad_profiles").upsert(
      {
        podcast_id: signal.id,
        collaboration_status: "candidate",
        brand_safety_score: safety.score,
        brand_safety_tags: safety.tags,
        brand_safety_notes: safety.notes,
        suggested_price_min_rmb: price.min,
        suggested_price_max_rmb: price.max,
        pricing_basis: price.basis,
        data_confidence: confidence,
        source_notes: "由 Dashboard 今日建议建联加入 Campaign 时生成",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "podcast_id" },
    );

    await supabaseAdmin.from("creator_contacts").upsert(
      {
        podcast_id: signal.id,
        platform: "podcast",
        profile_url: null,
        status: "unknown",
        notes: "Dashboard 加入 Campaign，待补充公开联系方式",
      },
      { onConflict: "podcast_id,platform,profile_url" },
    );

    return { ok: true, duplicated: false, campaignPodcastId: inserted.id };
  });

export const updatePodcastAdProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        podcastId: z.string().uuid(),
        contactMethod: z.string().trim().max(500).nullable().optional(),
        contactEmail: z.string().trim().max(200).nullable().optional(),
        contactWechat: z.string().trim().max(100).nullable().optional(),
        quoteMinRmb: z.number().int().min(0).nullable().optional(),
        quoteMaxRmb: z.number().int().min(0).nullable().optional(),
        hostReadMinRmb: z.number().int().min(0).nullable().optional(),
        hostReadMaxRmb: z.number().int().min(0).nullable().optional(),
        sponsorshipMinRmb: z.number().int().min(0).nullable().optional(),
        sponsorshipMaxRmb: z.number().int().min(0).nullable().optional(),
        customEpisodeMinRmb: z.number().int().min(0).nullable().optional(),
        customEpisodeMaxRmb: z.number().int().min(0).nullable().optional(),
        responseRate: z.number().min(0).max(100).nullable().optional(),
        collaborationStatus: z.string().trim().max(80).nullable().optional(),
        historicalBrands: z.string().trim().max(2000).nullable().optional(),
        adCategories: z.string().trim().max(1000).nullable().optional(),
        notes: z.string().trim().max(3000).nullable().optional(),
        brandSafetyScore: z.number().int().min(0).max(100).nullable().optional(),
        brandSafetyTags: z.string().trim().max(1000).nullable().optional(),
        brandSafetyNotes: z.string().trim().max(2000).nullable().optional(),
        suggestedPriceMinRmb: z.number().int().min(0).nullable().optional(),
        suggestedPriceMaxRmb: z.number().int().min(0).nullable().optional(),
        pricingBasis: z.string().trim().max(2000).nullable().optional(),
        dataConfidence: confidenceSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const updates = {
      podcast_id: data.podcastId,
      ...(data.contactMethod !== undefined ? { contact_method: data.contactMethod || null } : {}),
      ...(data.contactEmail !== undefined ? { contact_email: data.contactEmail || null } : {}),
      ...(data.contactWechat !== undefined ? { contact_wechat: data.contactWechat || null } : {}),
      ...(data.quoteMinRmb !== undefined ? { quote_min_rmb: data.quoteMinRmb } : {}),
      ...(data.quoteMaxRmb !== undefined ? { quote_max_rmb: data.quoteMaxRmb } : {}),
      ...(data.hostReadMinRmb !== undefined ? { host_read_min_rmb: data.hostReadMinRmb } : {}),
      ...(data.hostReadMaxRmb !== undefined ? { host_read_max_rmb: data.hostReadMaxRmb } : {}),
      ...(data.sponsorshipMinRmb !== undefined ? { sponsorship_min_rmb: data.sponsorshipMinRmb } : {}),
      ...(data.sponsorshipMaxRmb !== undefined ? { sponsorship_max_rmb: data.sponsorshipMaxRmb } : {}),
      ...(data.customEpisodeMinRmb !== undefined ? { custom_episode_min_rmb: data.customEpisodeMinRmb } : {}),
      ...(data.customEpisodeMaxRmb !== undefined ? { custom_episode_max_rmb: data.customEpisodeMaxRmb } : {}),
      ...(data.responseRate !== undefined ? { response_rate: data.responseRate } : {}),
      ...(data.collaborationStatus !== undefined ? { collaboration_status: data.collaborationStatus || "unknown" } : {}),
      ...(data.historicalBrands !== undefined ? { historical_brands: splitList(data.historicalBrands) } : {}),
      ...(data.adCategories !== undefined ? { ad_categories: splitList(data.adCategories) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.brandSafetyScore !== undefined && data.brandSafetyScore !== null
        ? { brand_safety_score: data.brandSafetyScore }
        : {}),
      ...(data.brandSafetyTags !== undefined ? { brand_safety_tags: splitList(data.brandSafetyTags) } : {}),
      ...(data.brandSafetyNotes !== undefined ? { brand_safety_notes: data.brandSafetyNotes || null } : {}),
      ...(data.suggestedPriceMinRmb !== undefined ? { suggested_price_min_rmb: data.suggestedPriceMinRmb } : {}),
      ...(data.suggestedPriceMaxRmb !== undefined ? { suggested_price_max_rmb: data.suggestedPriceMaxRmb } : {}),
      ...(data.pricingBasis !== undefined ? { pricing_basis: data.pricingBasis || null } : {}),
      ...(data.dataConfidence ? { data_confidence: data.dataConfidence } : {}),
      ...(data.dataConfidence === "manual_confirmed" ? { manually_confirmed_at: now } : {}),
      updated_at: now,
    };
    const { error } = await supabaseAdmin.from("podcast_ad_profiles").upsert(updates, {
      onConflict: "podcast_id",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCompetitorCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        podcastId: z.string().uuid(),
        brandName: z.string().trim().min(1).max(200),
        brandCategory: z.string().trim().max(120).nullable().optional(),
        adFormat: z.string().trim().max(120).nullable().optional(),
        lastSeenAt: z.string().trim().max(20).nullable().optional(),
        evidenceUrl: z.string().trim().max(1000).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        dataConfidence: confidenceSchema.default("public_data"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("competitor_campaigns").insert({
      podcast_id: data.podcastId,
      brand_name: data.brandName,
      brand_category: data.brandCategory || null,
      ad_format: data.adFormat || null,
      first_seen_at: data.lastSeenAt || null,
      last_seen_at: data.lastSeenAt || null,
      evidence_url: data.evidenceUrl || null,
      notes: data.notes || null,
      data_confidence: data.dataConfidence,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitCreatorApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        podcastName: z.string().trim().min(1).max(200),
        hostName: z.string().trim().max(120).nullable().optional(),
        podcastUrl: z.string().trim().max(1000).nullable().optional(),
        contactEmail: z.string().trim().max(200).nullable().optional(),
        contactWechat: z.string().trim().max(100).nullable().optional(),
        introduction: z.string().trim().max(3000).nullable().optional(),
        quoteMinRmb: z.number().int().min(0).nullable().optional(),
        quoteMaxRmb: z.number().int().min(0).nullable().optional(),
        adCategories: z.string().trim().max(1000).nullable().optional(),
        authorizedMetrics: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("creator_submissions").insert({
      podcast_name: data.podcastName,
      host_name: data.hostName || null,
      podcast_url: data.podcastUrl || null,
      contact_email: data.contactEmail || null,
      contact_wechat: data.contactWechat || null,
      introduction: data.introduction || null,
      quote_min_rmb: data.quoteMinRmb ?? null,
      quote_max_rmb: data.quoteMaxRmb ?? null,
      ad_categories: splitList(data.adCategories),
      authorized_metrics: (data.authorizedMetrics ?? {}) as Json,
      status: "new",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCampaignReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        actualSpendRmb: z.number().int().min(0).nullable(),
        actualReach: z.number().int().min(0).nullable(),
        actualClicks: z.number().int().min(0).nullable(),
        actualConversions: z.number().int().min(0).nullable(),
        reviewNotes: z.string().trim().max(4000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: campaign, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "投放项目不存在");

    const ai = await callAi(
      [
        {
          role: "system",
          content: "你是播客投放复盘专家，只输出简洁中文结论。",
        },
        {
          role: "user",
          content: `请为以下播客投放项目生成复盘总结，包含表现判断、原因、下一轮优化建议。
投放项目：${campaign.name}
计划状态：${campaign.status}
实际花费：${data.actualSpendRmb ?? "未知"} RMB
实际触达：${data.actualReach ?? "未知"}
实际点击：${data.actualClicks ?? "未知"}
实际转化：${data.actualConversions ?? "未知"}
人工备注：${data.reviewNotes ?? "无"}
请控制在 180 字以内。`,
        },
      ],
      { modelEnvName: "AI_STRATEGY_MODEL" },
    );

    const { error: updateError } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "reviewed",
        actual_spend_rmb: data.actualSpendRmb,
        actual_reach: data.actualReach,
        actual_clicks: data.actualClicks,
        actual_conversions: data.actualConversions,
        review_notes: data.reviewNotes,
        review_summary: ai.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.campaignId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, reviewSummary: ai.content };
  });
