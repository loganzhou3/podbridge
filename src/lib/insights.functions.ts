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

// ---------- AI ----------
type AiMessage = { role: string; content: string };
type AiEndpoint = "responses" | "chat_completions";

function getAiConfig(modelEnvName: string) {
  const hasGateway = Boolean(process.env.AI_GATEWAY_URL && process.env.AI_GATEWAY_API_KEY);
  const baseUrl = hasGateway
    ? process.env.AI_GATEWAY_URL!
    : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses");
  const apiKey = hasGateway ? process.env.AI_GATEWAY_API_KEY : process.env.OPENAI_API_KEY;
  const model = process.env[modelEnvName] ?? process.env.AI_MODEL ?? "gpt-5-mini";
  const endpoint: AiEndpoint = baseUrl.includes("/chat/completions")
    ? "chat_completions"
    : "responses";

  if (!apiKey) {
    throw new Error(
      "AI API key 未配置：请设置 AI_GATEWAY_API_KEY（如 DeepSeek）或 OPENAI_API_KEY",
    );
  }

  return { baseUrl, apiKey, model, endpoint };
}

function extractResponsesText(data: unknown): string {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (typeof record.output_text === "string") return record.output_text;

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const itemRecord = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      const partRecord = part && typeof part === "object" ? (part as Record<string, unknown>) : {};
      if (typeof partRecord.refusal === "string" && partRecord.refusal.trim()) {
        throw new Error(`AI 拒绝生成：${partRecord.refusal}`);
      }
      if (typeof partRecord.text === "string") parts.push(partRecord.text);
    }
  }
  return parts.join("").trim();
}

export async function callAi(
  messages: AiMessage[],
  opts?: { json?: boolean; modelEnvName?: string },
): Promise<{ content: string; model: string }> {
  const { baseUrl, apiKey, model, endpoint } = getAiConfig(
    opts?.modelEnvName ?? "AI_STRATEGY_MODEL",
  );
  const body =
    endpoint === "responses"
      ? {
          model,
          input: messages,
          ...(opts?.json ? { text: { format: { type: "json_object" } } } : {}),
        }
      : {
          model,
          messages,
          ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        };

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429 && detail.includes("insufficient_quota")) {
      throw new Error("OpenAI API 额度不足：请在 OpenAI Platform 绑定付款方式或充值额度");
    }
    if (res.status === 402 && detail.toLowerCase().includes("insufficient balance")) {
      throw new Error("DeepSeek API 余额不足：请在 DeepSeek Platform 充值后重试");
    }
    if (res.status === 429) throw new Error("AI 调用过于频繁，请稍后再试");
    if (res.status === 402) throw new Error("AI 额度已用尽，请检查当前 AI 服务商额度");
    throw new Error(`AI 调用失败：${res.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content =
    endpoint === "responses"
      ? extractResponsesText(data)
      : (data.choices?.[0]?.message?.content ?? "");
  return { content, model };
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
type PlatformScrape = {
  title: string | null;
  author: string | null;
  description: string | null;
  image: string | null;
  subs: number | null;
  comments: number | null;
  episodeCount: number | null;
  plays: number | null;
  contacts: ExtractedCreatorContacts;
};

type ExtractedCreatorContacts = {
  emails: string[];
  wechat: string[];
  notes: string[];
  sourceText: string | null;
};

function stripHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

const CREATOR_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CREATOR_WECHAT_RE =
  /(?:微信|VX|WeChat|wechat|联系|商务合作|商务)[号：:\s]*([a-zA-Z][-_a-zA-Z0-9]{5,19})/gi;

function extractCreatorContacts(texts: Array<unknown>): ExtractedCreatorContacts {
  const source = texts
    .map((value) => stripHtml(value) ?? "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
  const emails = Array.from(new Set(source.match(CREATOR_EMAIL_RE) ?? []));
  const wechat = Array.from(
    new Set(
      [...source.matchAll(CREATOR_WECHAT_RE)]
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const notes = source
    .split(/[。；;\n]/)
    .map((line) => line.trim())
    .filter((line) => /商务|合作|联系|邮箱|邮件|微信|wechat|WeChat|VX/i.test(line))
    .slice(0, 4);
  return { emails, wechat, notes, sourceText: source || null };
}

async function upsertCreatorContacts({
  podcastId,
  platform,
  profileUrl,
  contacts,
}: {
  podcastId: string;
  platform: string;
  profileUrl: string | null;
  contacts: ExtractedCreatorContacts;
}) {
  const rows = [];
  for (const email of contacts.emails) {
    rows.push({
      podcast_id: podcastId,
      platform,
      profile_url: profileUrl,
      contact_email: email,
      contact_name: null,
      status: "found",
      notes: contacts.notes.join("；") || "平台主页公开邮箱",
      updated_at: new Date().toISOString(),
    });
  }
  for (const handle of contacts.wechat) {
    rows.push({
      podcast_id: podcastId,
      platform,
      profile_url: profileUrl,
      contact_email: null,
      contact_name: handle,
      status: "found",
      notes: contacts.notes.join("；") || `平台主页公开微信：${handle}`,
      updated_at: new Date().toISOString(),
    });
  }
  if (!rows.length && contacts.notes.length) {
    rows.push({
      podcast_id: podcastId,
      platform,
      profile_url: profileUrl,
      contact_email: null,
      contact_name: null,
      status: "found",
      notes: contacts.notes.join("；"),
      updated_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return;
  const { data: existing } = await supabaseAdmin
    .from("creator_contacts")
    .select("contact_email,contact_name,platform")
    .eq("podcast_id", podcastId);
  const existingKeys = new Set(
    (existing ?? []).map((row) => `${row.platform ?? ""}:${row.contact_email ?? ""}:${row.contact_name ?? ""}`),
  );
  const missing = rows.filter(
    (row) => !existingKeys.has(`${row.platform ?? ""}:${row.contact_email ?? ""}:${row.contact_name ?? ""}`),
  );
  if (!missing.length) return;
  const { error } = await supabaseAdmin.from("creator_contacts").insert(missing);
  if (error) console.warn("[creator_contacts] insert failed", error.message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function readNested(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const r = asRecord(current);
    if (!r) return null;
    current = r[key];
  }
  return current;
}

async function fetchText(url: string, headers?: HeadersInit) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
      ...headers,
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const text = await fetchText(url, {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.5",
    ...headers,
  });
  return JSON.parse(text) as T;
}

async function scrapeXiaoyuzhou(url: string): Promise<PlatformScrape> {
  const html = await fetchText(url);
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("小宇宙页面缺少结构化数据");
  const nextData = JSON.parse(match[1]) as Record<string, unknown>;
  const podcast = asRecord(readNested(nextData, ["props", "pageProps", "podcast"]));
  if (!podcast) throw new Error("小宇宙节目数据无法解析");

  const image = asRecord(podcast.image);
  const podcasters = Array.isArray(podcast.podcasters) ? podcast.podcasters : [];
  const hostNames = podcasters
    .map((p) => readNested(asRecord(p), ["nickname"]))
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  const episodes = Array.isArray(podcast.episodes) ? podcast.episodes : [];
  const podcasterNotes = podcasters.flatMap((p) => {
    const record = asRecord(p);
    return [record?.bio, record?.description, record?.intro];
  });
  const comments = episodes.reduce((sum, ep) => {
    const r = asRecord(ep);
    return sum + (asNumber(r?.commentCount ?? r?.commentsCount ?? r?.comments) ?? 0);
  }, 0);

  return {
    title: typeof podcast.title === "string" ? podcast.title.trim() : null,
    author:
      hostNames.join("、") || (typeof podcast.author === "string" ? podcast.author.trim() : null),
    description: stripHtml(podcast.description),
    image:
      (typeof image?.picUrl === "string" && image.picUrl) ||
      (typeof image?.largePicUrl === "string" && image.largePicUrl) ||
      null,
    subs: asNumber(podcast.subscriptionCount),
    comments: comments > 0 ? comments : null,
    episodeCount: asNumber(podcast.episodeCount),
    plays: null,
    contacts: extractCreatorContacts([podcast.description, podcast.brief, podcast.author, ...podcasterNotes]),
  };
}

function extractXimalayaAlbumId(url: string) {
  return url.match(/ximalaya\.com\/(?:album|podcast)\/(\d+)/i)?.[1] ?? null;
}

function toXimalayaAlbumUrl(value: string | null | undefined) {
  if (!value) return null;
  const albumId = extractXimalayaAlbumId(value);
  return albumId ? `https://www.ximalaya.com/album/${albumId}` : null;
}

function extractXiaoyuzhouPodcastUrl(text: string) {
  const match = text.match(/https:\/\/www\.xiaoyuzhoufm\.com\/podcast\/[a-z0-9]+/i);
  return match?.[0] ?? null;
}

async function derivePlatformUrlsFromRss(rssUrl: string | null | undefined) {
  if (!rssUrl) return { xiaoyuzhouUrl: null, ximalayaUrl: null };

  const ximalayaUrl = toXimalayaAlbumUrl(rssUrl);
  if (ximalayaUrl) return { xiaoyuzhouUrl: null, ximalayaUrl };

  if (!/feed\.xyzfm\.space|xiaoyuzhou|xyzcdn|xyzfm/i.test(rssUrl)) {
    return { xiaoyuzhouUrl: null, ximalayaUrl: null };
  }

  try {
    const r = await fetch(rssUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
      },
    });
    if (!r.ok) return { xiaoyuzhouUrl: null, ximalayaUrl: null };
    const xml = await r.text();
    return { xiaoyuzhouUrl: extractXiaoyuzhouPodcastUrl(xml), ximalayaUrl: null };
  } catch (e) {
    console.error("derive platform url from rss failed", e);
    return { xiaoyuzhouUrl: null, ximalayaUrl: null };
  }
}

async function scrapeXimalaya(url: string): Promise<PlatformScrape> {
  const albumId = extractXimalayaAlbumId(url);
  if (!albumId) throw new Error("无法识别喜马拉雅 albumId");
  const payload = await fetchJson<{
    ret?: number;
    msg?: string;
    data?: { album?: Record<string, unknown>; user?: Record<string, unknown> };
  }>(
    `https://mobile.ximalaya.com/mobile/v1/album?device=android&albumId=${encodeURIComponent(albumId)}`,
  );
  if (payload.ret !== 0 || !payload.data?.album) {
    throw new Error(payload.msg || "喜马拉雅接口未返回专辑数据");
  }

  const album = payload.data.album;
  const user = payload.data.user;
  const title = typeof album.title === "string" ? album.title.trim() : null;
  const intro =
    stripHtml(album.intro) ||
    stripHtml(album.shortIntro) ||
    stripHtml(album.introRich) ||
    stripHtml(album.customSubTitle);

  return {
    title,
    author:
      (typeof album.nickname === "string" && album.nickname.trim()) ||
      (typeof user?.nickname === "string" && user.nickname.trim()) ||
      null,
    description: intro,
    image:
      (typeof album.coverLarge === "string" && album.coverLarge) ||
      (typeof album.coverWebLarge === "string" && album.coverWebLarge) ||
      (typeof album.detailCoverPath === "string" && album.detailCoverPath) ||
      null,
    subs: asNumber(album.subscribeCount),
    comments: asNumber(album.unReadAlbumCommentCount),
    episodeCount: asNumber(album.tracks) ?? asNumber(album.totalTrackCount),
    plays: asNumber(album.playTimes),
    contacts: extractCreatorContacts([
      album.intro,
      album.shortIntro,
      album.introRich,
      album.customSubTitle,
      album.nickname,
      user?.nickname,
    ]),
  };
}

async function scrapePlatformUrl(url: string, kind: "xyz" | "xmly"): Promise<PlatformScrape> {
  try {
    return kind === "xyz" ? await scrapeXiaoyuzhou(url) : await scrapeXimalaya(url);
  } catch (error) {
    console.error(`${kind} structured scrape failed`, error);
    throw new Error(kind === "xyz" ? "小宇宙平台数据抓取失败" : "喜马拉雅平台数据抓取失败");
  }
}

export const scrapePodcastPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ podcastId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .select("id,rss_url,xiaoyuzhou_url,ximalaya_url,itunes_id")
      .eq("id", data.podcastId)
      .single();
    if (error || !pod) throw new Error("播客不存在");

    const derived = await derivePlatformUrlsFromRss(pod.rss_url);
    const xiaoyuzhouUrl = pod.xiaoyuzhou_url ?? derived.xiaoyuzhouUrl;
    const ximalayaUrl =
      toXimalayaAlbumUrl(pod.ximalaya_url) ?? pod.ximalaya_url ?? derived.ximalayaUrl;

    if (!xiaoyuzhouUrl && !ximalayaUrl && !pod.itunes_id) {
      throw new Error("请先填写小宇宙 / 喜马拉雅 / Apple 链接");
    }

    const updates: {
      updated_at: string;
      last_synced_at: string;
      metrics_updated_at: string;
      xiaoyuzhou_subscribers?: number | null;
      xiaoyuzhou_comments?: number | null;
      xiaoyuzhou_episode_count?: number | null;
      ximalaya_plays?: number | null;
      ximalaya_subscribers?: number | null;
      ximalaya_comments?: number | null;
      apple_reviews?: number | null;
      xiaoyuzhou_url?: string | null;
      ximalaya_url?: string | null;
    } = {
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metrics_updated_at: new Date().toISOString(),
    };
    let snapshotEpisodeCount: number | null = null;
    let snapshotXiaoyuzhouSubscribers: number | null = null;
    let snapshotXimalayaPlays: number | null = null;

    if (xiaoyuzhouUrl && !pod.xiaoyuzhou_url) updates.xiaoyuzhou_url = xiaoyuzhouUrl;
    if (ximalayaUrl && ximalayaUrl !== pod.ximalaya_url) updates.ximalaya_url = ximalayaUrl;

    if (xiaoyuzhouUrl) {
      try {
        const s = await scrapePlatformUrl(xiaoyuzhouUrl, "xyz");
        updates.xiaoyuzhou_subscribers = s.subs;
        updates.xiaoyuzhou_comments = s.comments;
        updates.xiaoyuzhou_episode_count = s.episodeCount;
        snapshotEpisodeCount = s.episodeCount ?? snapshotEpisodeCount;
        snapshotXiaoyuzhouSubscribers = s.subs;
        await upsertCreatorContacts({
          podcastId: data.podcastId,
          platform: "小宇宙",
          profileUrl: xiaoyuzhouUrl,
          contacts: s.contacts,
        });
      } catch (e) {
        console.error("xiaoyuzhou scrape failed", e);
      }
    }

    if (ximalayaUrl) {
      try {
        const s = await scrapePlatformUrl(ximalayaUrl, "xmly");
        updates.ximalaya_plays = s.plays;
        updates.ximalaya_subscribers = s.subs;
        updates.ximalaya_comments = s.comments;
        snapshotEpisodeCount = s.episodeCount ?? snapshotEpisodeCount;
        snapshotXimalayaPlays = s.plays;
        await upsertCreatorContacts({
          podcastId: data.podcastId,
          platform: "喜马拉雅",
          profileUrl: ximalayaUrl,
          contacts: s.contacts,
        });
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
    if (
      snapshotEpisodeCount != null ||
      snapshotXiaoyuzhouSubscribers != null ||
      snapshotXimalayaPlays != null
    ) {
      const { error: snapErr } = await supabaseAdmin.from("snapshots").insert({
        podcast_id: data.podcastId,
        episode_count: snapshotEpisodeCount,
        estimated_subscribers: snapshotXiaoyuzhouSubscribers,
        xiaoyuzhou_subscribers: snapshotXiaoyuzhouSubscribers,
        ximalaya_plays: snapshotXimalayaPlays,
      });
      if (snapErr) console.warn("[platform-sync] snapshot insert failed", snapErr.message);
    }
    return { ok: true as const };
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
      const baseRow = {
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
      const row =
        kind === "xyz"
          ? {
              ...baseRow,
              xiaoyuzhou_url: data.url,
              xiaoyuzhou_subscribers: s.subs,
              xiaoyuzhou_comments: s.comments,
              xiaoyuzhou_episode_count: s.episodeCount,
            }
          : {
              ...baseRow,
              ximalaya_url: data.url,
              ximalaya_plays: s.plays,
              ximalaya_subscribers: s.subs,
              ximalaya_comments: s.comments,
            };

      const { data: pod, error } = await supabaseAdmin
        .from("podcasts")
        .upsert(row as never, { onConflict: conflictCol })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabaseAdmin.from("snapshots").insert({
        podcast_id: pod.id,
        episode_count: s.episodeCount ?? 0,
        xiaoyuzhou_subscribers: kind === "xyz" ? s.subs : null,
        ximalaya_plays: kind === "xmly" ? s.plays : null,
      });

      await upsertCreatorContacts({
        podcastId: pod.id,
        platform: kind === "xyz" ? "小宇宙" : "喜马拉雅",
        profileUrl: data.url,
        contacts: s.contacts,
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
  platform: "apple" | "listen_notes" | "xiaoyuzhou" | "ximalaya";
  id: string;
  title: string;
  author: string | null;
  url: string;
  feedUrl: string | null;
  artwork: string | null;
  xiaoyuzhouUrl?: string | null;
  ximalayaUrl?: string | null;
};

type ListenNotesSearchResult = {
  id?: string;
  title_original?: string;
  title_highlighted?: string;
  publisher_original?: string;
  publisher_highlighted?: string;
  image?: string;
  thumbnail?: string;
  rss?: string;
  website?: string;
  listennotes_url?: string;
  description_original?: string;
  description_highlighted?: string;
  extra?: Record<string, unknown>;
  total_episodes?: number;
  latest_pub_date_ms?: number;
};

function extractPlatformUrlsFromValues(...values: Array<unknown>) {
  const combined = values
    .map((value) => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)))
    .join("\n");
  return {
    xiaoyuzhouUrl: extractXiaoyuzhouPodcastUrl(combined),
    ximalayaUrl: toXimalayaAlbumUrl(combined),
  };
}

async function getListenNotesPodcastDetail(id: string, apiKey: string) {
  const u = new URL(`https://listen-api.listennotes.com/api/v2/podcasts/${encodeURIComponent(id)}`);
  u.searchParams.set("sort", "recent_first");
  u.searchParams.set("podcast_extra", "website");
  const res = await fetch(u, {
    headers: {
      "X-ListenAPI-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as ListenNotesSearchResult;
}

async function searchListenNotesPodcasts(query: string, limit: number): Promise<SearchHit[]> {
  const apiKey = process.env.LISTEN_NOTES_API_KEY;
  if (!apiKey) return [];

  const pageSize = Math.min(10, Math.max(1, limit));
  const offsets = Array.from(
    { length: Math.max(1, Math.min(3, Math.ceil(limit / pageSize))) },
    (_, index) => index * pageSize,
  );
  const hits: SearchHit[] = [];

  for (const offset of offsets) {
    const u = new URL("https://listen-api.listennotes.com/api/v2/search");
    u.searchParams.set("q", query);
    u.searchParams.set("type", "podcast");
    u.searchParams.set("language", "Chinese");
    u.searchParams.set("region", "cn");
    u.searchParams.set("sort_by_date", "0");
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("page_size", String(pageSize));

    const res = await fetch(u, {
      headers: {
        "X-ListenAPI-Key": apiKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Listen Notes 搜索失败：${res.status}`);

    const payload = (await res.json()) as { results?: ListenNotesSearchResult[] };
    for (const item of payload.results ?? []) {
      if (!item.id || !item.rss) continue;
      const detail = await getListenNotesPodcastDetail(item.id, apiKey).catch(() => null);
      const platformUrls = extractPlatformUrlsFromValues(
        item.rss,
        item.website,
        item.listennotes_url,
        item.description_original,
        item.description_highlighted,
        item.extra,
        detail,
      );
      hits.push({
        platform: "listen_notes",
        id: item.id,
        title:
          stripHtml(detail?.title_original) ??
          stripHtml(item.title_original) ??
          stripHtml(item.title_highlighted) ??
          "Unknown",
        author:
          stripHtml(detail?.publisher_original) ??
          stripHtml(item.publisher_original) ??
          stripHtml(item.publisher_highlighted),
        url: detail?.listennotes_url ?? item.listennotes_url ?? item.rss,
        feedUrl: detail?.rss ?? item.rss,
        artwork: detail?.image ?? detail?.thumbnail ?? item.image ?? item.thumbnail ?? null,
        xiaoyuzhouUrl: platformUrls.xiaoyuzhouUrl,
        ximalayaUrl: platformUrls.ximalayaUrl,
      });
    }
  }

  const seen = new Set<string>();
  return hits
    .filter((hit) => {
      const key = hit.feedUrl ?? hit.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

type XimalayaSearchDoc = {
  id?: number | string;
  title?: string;
  highLightTitle?: string;
  nickname?: string;
  cover_path?: string;
  coverPath?: string;
  count_subscribe?: number;
  play?: number;
  intro?: string;
  _match_score?: number;
};

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/stochastic\s*volatility/i, "随机波动")
    .replace(/[｜|·•:：\-–—_\s《》【】「」"'“”‘’()[\]{}]/g, "")
    .trim();
}

function scoreTitleMatch(query: string, title: string) {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(title);
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 70;

  const qChars = new Set([...q]);
  const tChars = new Set([...t]);
  let overlap = 0;
  qChars.forEach((char) => {
    if (tChars.has(char)) overlap++;
  });
  return Math.round((overlap / Math.max(qChars.size, 1)) * 60);
}

async function searchXimalayaAlbums(query: string, limit: number): Promise<SearchHit[]> {
  const rows = Math.min(30, Math.max(limit, 10));
  const pages = Math.max(1, Math.min(4, Math.ceil(limit / rows)));
  const docs: XimalayaSearchDoc[] = [];

  for (let page = 1; page <= pages; page++) {
    const u = new URL("https://search.ximalaya.com/front/v1");
    u.searchParams.set("core", "album");
    u.searchParams.set("kw", query);
    u.searchParams.set("page", String(page));
    u.searchParams.set("rows", String(rows));

    const r = await fetch(u, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
      },
    });
    if (!r.ok) throw new Error(`喜马拉雅搜索失败：${r.status}`);

    const payload = (await r.json()) as { response?: { docs?: XimalayaSearchDoc[] } };
    docs.push(...(payload.response?.docs ?? []));
  }

  const ranked = docs
    .map((doc) => {
      const id = doc.id == null ? null : String(doc.id);
      const title = stripHtml(doc.title) ?? stripHtml(doc.highLightTitle);
      if (!id || !title) return null;

      const titleScore = scoreTitleMatch(query, title);
      const popularityScore = Math.min(20, Math.log10(Math.max(doc.count_subscribe ?? 0, 1)) * 4);
      const playScore = Math.min(10, Math.log10(Math.max(doc.play ?? 0, 1)) * 2);
      const podcastSignal = /播客|podcast|fm|电台|访谈|对谈|圆桌|聊天|脱口秀|talk/i.test(
        `${title} ${doc.nickname ?? ""} ${doc.intro ?? ""}`,
      )
        ? 18
        : 0;

      return {
        hit: {
          platform: "ximalaya" as const,
          id,
          title,
          author: stripHtml(doc.nickname),
          url: `https://www.ximalaya.com/album/${id}`,
          feedUrl: null,
          artwork: doc.cover_path ?? doc.coverPath ?? null,
        },
        score: titleScore + popularityScore + playScore + podcastSignal + (doc._match_score ?? 0),
      };
    })
    .filter((item): item is { hit: SearchHit; score: number } => Boolean(item))
    .filter((item) => item.score >= 28)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  return ranked
    .filter((item) => {
      if (seen.has(item.hit.id)) return false;
      seen.add(item.hit.id);
      return true;
    })
    .slice(0, limit)
    .map((item) => item.hit);
}

async function searchLocalPlatformPodcasts(query: string, limit: number): Promise<SearchHit[]> {
  const { data, error } = await supabaseAdmin
    .from("podcasts")
    .select("id,title,author,image_url,xiaoyuzhou_url,ximalaya_url,rss_url")
    .ilike("title", `%${query}%`)
    .limit(50);
  if (error) {
    console.error("local platform podcast search failed", error);
    return [];
  }

  const ranked: Array<{ hit: SearchHit; score: number }> = [];
  for (const pod of data ?? []) {
    const title = String(pod.title ?? "").trim();
    if (!title) continue;

    const score = scoreTitleMatch(query, title);
    if (score < 50) continue;

    const rssUrl = typeof pod.rss_url === "string" ? pod.rss_url : null;
    const derived = await derivePlatformUrlsFromRss(rssUrl);
    const xiaoyuzhouUrl =
      (typeof pod.xiaoyuzhou_url === "string" && pod.xiaoyuzhou_url.trim()) ||
      derived.xiaoyuzhouUrl;
    const ximalayaUrl =
      toXimalayaAlbumUrl(typeof pod.ximalaya_url === "string" ? pod.ximalaya_url : null) ??
      derived.ximalayaUrl;
    const platformUrl = xiaoyuzhouUrl ?? ximalayaUrl;
    if (!platformUrl) continue;

    const platform: SearchHit["platform"] = xiaoyuzhouUrl ? "xiaoyuzhou" : "ximalaya";
    ranked.push({
      hit: {
        platform,
        id: String(pod.id),
        title,
        author: typeof pod.author === "string" ? pod.author : null,
        url: platformUrl,
        feedUrl: rssUrl,
        artwork: typeof pod.image_url === "string" ? pod.image_url : null,
      },
      score,
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.hit);
}

export const searchPodcastsAllPlatforms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(200),
        market: z.enum(["cn", "na"]).default("cn"),
        limit: z.number().int().min(1).max(30).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const results: SearchHit[] = [];
    const country = data.market === "na" ? "US" : "CN";

    if (data.market === "cn") {
      try {
        results.push(...(await searchListenNotesPodcasts(data.query, data.limit)));
      } catch (e) {
        console.error("listen notes search failed", e);
      }
    }

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
        results.push(...(await searchLocalPlatformPodcasts(data.query, data.limit)));
      } catch (e) {
        console.error("local platform search failed", e);
      }

      try {
        results.push(...(await searchXimalayaAlbums(data.query, data.limit)));
      } catch (e) {
        console.error("ximalaya api search failed", e);
      }
    }

    const orderedResults =
      data.market === "cn"
        ? results.sort((a, b) => {
            const rank = { xiaoyuzhou: 0, listen_notes: 1, ximalaya: 2, apple: 3 } as const;
            const rankDiff = rank[a.platform] - rank[b.platform];
            if (rankDiff !== 0) return rankDiff;
            return scoreTitleMatch(data.query, b.title) - scoreTitleMatch(data.query, a.title);
          })
        : results;

    const seen = new Set<string>();
    const deduped = orderedResults.filter((item) => {
      const key = `${item.platform}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { ok: true as const, results: deduped };
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
  .inputValidator((input: unknown) => z.object({ podcastId: z.string().uuid() }).parse(input))
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

    const ai = await callAi(
      [
        { role: "system", content: "你是资深中文播客广告策略顾问，只输出严格 JSON。" },
        { role: "user", content: prompt },
      ],
      { json: true, modelEnvName: "AI_STRATEGY_MODEL" },
    );
    const raw = ai.content;
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
    await supabaseAdmin.from("brand_recommendations").delete().eq("podcast_id", data.podcastId);

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
const BD_HINTS = [
  "bd@",
  "biz@",
  "business@",
  "marketing@",
  "pr@",
  "media@",
  "cooperation@",
  "contact@",
  "hello@",
];

function pickBestEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  const filtered = emails.filter(
    (e) => !/example\.com|sentry\.io|wixpress|@2x|\.png|\.jpg|noreply|no-reply/i.test(e),
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
  .inputValidator((input: unknown) => z.object({ podcastId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("brand_recommendations")
      .select("*")
      .eq("podcast_id", data.podcastId)
      .order("fit_score", { ascending: false });
    if (error) throw new Error(error.message);
    return { brands: rows ?? [] };
  });

// ---------- Campaign Planner ----------
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
    const podcastSelect =
      "id,title,author,description,category,audience_tags,episode_count,commercial_score,activity_score,growth_score,lifecycle_stage,update_frequency_days,xiaoyuzhou_subscribers,ximalaya_subscribers,ximalaya_plays,monthly_active_listeners,cpm_rate";
    const pods: Array<{
      id: string;
      title: string | null;
      author: string | null;
      description: string | null;
      category: string | null;
      audience_tags: string[] | null;
      episode_count: number | null;
      commercial_score: number | null;
      activity_score: number | null;
      growth_score: number | null;
      lifecycle_stage: string | null;
      update_frequency_days: number | null;
      xiaoyuzhou_subscribers: number | null;
      ximalaya_subscribers: number | null;
      ximalaya_plays: number | null;
      monthly_active_listeners: number | null;
      cpm_rate: number | null;
    }> = [];
    for (let from = 0; from < 8000; from += 1000) {
      const { data: page, error } = await supabaseAdmin
        .from("podcasts")
        .select(podcastSelect)
        .eq("market", "cn")
        .order("xiaoyuzhou_subscribers", { ascending: false, nullsFirst: false })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!page?.length) break;
      pods.push(...page);
      if (page.length < 1000) break;
    }

    type PodcastCandidate = (typeof pods)[number];
    type CandidateTier = "头部" | "腰部" | "长尾";
    const nonPodcastPattern =
      /有声书|小说|评书|相声|合集|完整版|纯享|全集|课程|训练营|讲座|视频版|音频版|名场面|高光|cut|脱口秀大会|今晚80后|单口喜剧专场|睡前故事|儿童故事|宝宝巴士|读书会|朗读|听书|原著|评传|传记|名著|全本|精讲|解读版|音频书|故事会|每日搞笑段子|笑话脱口秀/i;
    const serializedContentPattern =
      /经济史|企业史|人类简史|资本版|原声解读|一部简明|讲故事|好文|书摘|拆书|说书/i;
    const podcastSignalPattern =
      /播客|podcast|fm|电台|访谈|对谈|聊天|圆桌|闲谈|漫谈|脱口秀|观察|会客厅|聊天室|谈话|talk|radio/i;
    const categorySignal = new Set([
      "商业",
      "科技",
      "人文",
      "社会",
      "趣味闲谈",
      "职业探索",
      "影视娱乐",
      "音乐",
      "体育",
      "医疗健康",
      "饮食",
      "自我成长",
      "治愈陪伴",
      "兴趣生活",
      "艺术",
    ]);
    const normText = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("zh-CN");
    const briefText = normText(
      `${data.brandName} ${data.productDescription} ${data.goal} ${data.audienceNotes ?? ""}`,
    );
    const briefCategoryProfiles = [
      {
        key: "消费品/食品饮料",
        pattern: /咖啡|饮料|食品|零食|茶|酒|餐饮|奶|乳|健康餐|代餐|轻食|消费品|快消|新消费/i,
        positive: /生活|饮食|女性|职场|都市|消费|商业|健康|运动|自我成长|治愈|年轻|白领/i,
        categories: ["饮食", "兴趣生活", "商业", "治愈陪伴", "自我成长"],
      },
      {
        key: "科技/数码/SaaS",
        pattern: /科技|ai|人工智能|软件|saas|app|数码|硬件|效率工具|开发者|云|数据|智能/i,
        positive: /科技|商业|创业|互联网|职场|效率|产品|ai|数码|开发者|投资/i,
        categories: ["科技", "商业", "职业探索"],
      },
      {
        key: "美妆/个护/女性",
        pattern: /美妆|护肤|香水|个护|女性|穿搭|服饰|内衣|美容|医美|母婴/i,
        positive: /女性|生活|情感|都市|消费|健康|自我成长|治愈|审美|时尚/i,
        categories: ["治愈陪伴", "兴趣生活", "自我成长", "医疗健康"],
      },
      {
        key: "金融/商业服务",
        pattern: /金融|理财|证券|基金|保险|银行|财经|投资|b2b|企业服务|咨询|财税/i,
        positive: /商业|财经|投资|职场|创业|管理|科技|企业|增长/i,
        categories: ["商业", "科技", "职业探索"],
      },
      {
        key: "游戏/泛娱乐",
        pattern: /游戏|手游|电竞|二次元|影视|音乐|娱乐|ip|潮玩|动漫/i,
        positive: /游戏|兴趣|影视|娱乐|音乐|年轻|文化|科技|社区/i,
        categories: ["兴趣生活", "影视娱乐", "音乐", "科技"],
      },
      {
        key: "教育/职场成长",
        pattern: /教育|课程|学习|职场|招聘|求职|留学|语言|培训|知识付费/i,
        positive: /职场|自我成长|商业|科技|教育|学习|青年|白领|职业/i,
        categories: ["职业探索", "自我成长", "商业", "科技"],
      },
    ];
    const activeBriefProfiles = briefCategoryProfiles.filter((profile) => profile.pattern.test(briefText));
    const goalProfile =
      /转化|电商|私域|线索|下载|招商|招聘/i.test(data.goal)
        ? {
            key: "效果转化",
            positive: /商业|科技|职场|消费|垂直|效率|增长|健康/i,
            note: "目标偏转化，优先可解释人群和中腰部长尾效率",
          }
        : /曝光|声量|品牌/i.test(data.goal)
          ? {
              key: "品牌声量",
              positive: /头部|商业|社会|人文|科技|生活|文化|年轻|都市/i,
              note: "目标偏声量，保留头部背书但避免预算过度集中",
            }
          : {
              key: "种草测试",
              positive: /生活|职场|兴趣|消费|女性|青年|健康|商业|科技/i,
              note: "目标偏种草，优先调性清晰且更新稳定的节目",
            };

    const briefMatchEvidence = (p: PodcastCandidate) => {
      const haystack = normText(
        `${p.title ?? ""} ${p.author ?? ""} ${p.description ?? ""} ${p.category ?? ""} ${(p.audience_tags ?? []).join(" ")}`,
      );
      const reasons: string[] = [];
      const risks: string[] = [];
      let score = 0;

      for (const profile of activeBriefProfiles) {
        if (profile.positive.test(haystack) || (p.category && profile.categories.includes(p.category))) {
          score += 24;
          reasons.push(`匹配${profile.key}`);
        }
      }
      if (!activeBriefProfiles.length) {
        score += 8;
        reasons.push("按通用品牌安全池评估");
      }
      if (goalProfile.positive.test(haystack)) {
        score += 16;
        reasons.push(goalProfile.key);
      }
      if (p.update_frequency_days != null && p.update_frequency_days <= 14) {
        score += 10;
        reasons.push("更新稳定");
      } else if (p.update_frequency_days != null && p.update_frequency_days > 30) {
        score -= 12;
        risks.push("更新间隔偏长");
      }
      if (p.commercial_score != null && p.commercial_score >= 75) {
        score += 12;
        reasons.push("商业评分高");
      }
      if (p.growth_score != null && p.growth_score >= 70) {
        score += 8;
        reasons.push("增长信号较好");
      }
      if (/故事|怪谈|悬疑|有声|小说|课程|听力|助眠|星座|命理/i.test(haystack)) {
        score -= 35;
        risks.push("内容调性需品牌明确接受");
      }
      if (/头部/.test(data.targetTier) && estimateReach(p) >= 120000) {
        score += 8;
        reasons.push("符合头部诉求");
      }
      if (/腰部|混合/.test(data.targetTier) && estimateReach(p) >= 12000 && estimateReach(p) < 120000) {
        score += 8;
        reasons.push("符合中腰部组合");
      }
      if (/长尾|混合/.test(data.targetTier) && estimateReach(p) < 12000) {
        score += 8;
        reasons.push("适合长尾测试");
      }

      return {
        score,
        reasons: Array.from(new Set(reasons)).slice(0, 4),
        risks: Array.from(new Set(risks)).slice(0, 3),
      };
    };
    const excludedCandidateSamples: Array<{
      title: string | null;
      category: string | null;
      reason: string;
    }> = [];
    const rememberExcluded = (p: PodcastCandidate, reason: string) => {
      if (excludedCandidateSamples.length >= 12) return;
      excludedCandidateSamples.push({
        title: p.title,
        category: p.category,
        reason,
      });
    };
    const podcastEvidence = (p: PodcastCandidate) => {
      const title = p.title ?? "";
      const author = p.author ?? "";
      const desc = p.description ?? "";
      const sourceTags = (p.audience_tags ?? []).join(" ");
      const haystack = `${title} ${author} ${desc} ${sourceTags}`;
      const reasons: string[] = [];
      if (nonPodcastPattern.test(haystack)) {
        const reason = "排除：标题/简介像有声书、课程或合集";
        rememberExcluded(p, reason);
        return { eligible: false, basis: reason };
      }
      if (serializedContentPattern.test(`${title} ${author}`)) {
        const reason = "排除：标题像书籍解读、故事/段子或连续音频内容";
        rememberExcluded(p, reason);
        return { eligible: false, basis: reason };
      }
      if (/听友\d+|主播电台|个人专辑|的专辑/i.test(`${title} ${author}`)) {
        const reason = "排除：个人专辑或默认主播电台";
        rememberExcluded(p, reason);
        return { eligible: false, basis: reason };
      }
      if ((p.episode_count ?? 0) < 12) {
        const reason = "排除：集数不足 12 集";
        rememberExcluded(p, reason);
        return { eligible: false, basis: reason };
      }

      const hasPodcastSignal = podcastSignalPattern.test(haystack);
      const hasCategorySignal = Boolean(p.category && categorySignal.has(p.category));
      const hasXiaoyuzhou = Boolean(p.xiaoyuzhou_subscribers);
      const hasXimalaya = Boolean(p.ximalaya_subscribers || p.ximalaya_plays);

      if (hasXiaoyuzhou) reasons.push(`小宇宙订阅 ${p.xiaoyuzhou_subscribers}`);
      if (p.ximalaya_subscribers) reasons.push(`喜马拉雅订阅 ${p.ximalaya_subscribers}`);
      if (p.ximalaya_plays) reasons.push(`喜马拉雅播放 ${p.ximalaya_plays}`);
      if (hasPodcastSignal) reasons.push("标题/简介含播客形态关键词");
      if (hasCategorySignal) reasons.push(`分类 ${p.category}`);

      if (hasXiaoyuzhou) {
        return { eligible: true, basis: reasons.join("；") };
      }

      if (hasXimalaya && hasPodcastSignal && hasCategorySignal) {
        return { eligible: true, basis: reasons.join("；") };
      }

      const reason = "排除：缺少可验证的播客形态证据";
      rememberExcluded(p, reason);
      return { eligible: false, basis: reason };
    };
    const estimateReach = (p: PodcastCandidate) => {
      if (p.monthly_active_listeners) return p.monthly_active_listeners;
      if (p.xiaoyuzhou_subscribers) return Math.round(p.xiaoyuzhou_subscribers * 1.8);
      if (p.ximalaya_subscribers) return Math.round(p.ximalaya_subscribers * 1.2);
      if (p.ximalaya_plays)
        return Math.max(1000, Math.round(p.ximalaya_plays / Math.max(1, p.episode_count ?? 30)));
      return Math.max(1000, (p.commercial_score ?? 50) * 120);
    };
    const importedTier = (p: PodcastCandidate): CandidateTier | null => {
      const tags = (p.audience_tags ?? []).map((tag) => String(tag).toUpperCase());
      if (tags.includes("S")) return "头部";
      if (tags.includes("A") || tags.includes("B")) return "腰部";
      if (tags.includes("C")) return "长尾";
      return null;
    };
    const classifyTier = (p: PodcastCandidate): CandidateTier => {
      const reach = estimateReach(p);
      const imported = importedTier(p);
      if (imported === "头部" && reach >= 60000) return "头部";
      if (reach >= 120000) return "头部";
      if (reach >= 12000) return "腰部";
      if (imported === "腰部") return "腰部";
      return "长尾";
    };
    const estimateCpm = (p: PodcastCandidate) => {
      if (p.cpm_rate && p.cpm_rate > 0) return Math.round(p.cpm_rate);
      const tier = classifyTier(p);
      const score = p.commercial_score ?? 50;
      const base = tier === "头部" ? 260 : tier === "腰部" ? 160 : 90;
      return Math.round(base + Math.max(0, score - 50) * 2);
    };
    const budgetProfile =
      data.budgetRmb < 30000
        ? {
            maxCpm: 160,
            maxSingleSpendPct: 0.25,
            mix: { 头部: 0, 腰部: 6, 长尾: 10 },
            note: "小预算优先长尾与腰部测试，不配置头部播客。",
          }
        : data.budgetRmb < 100000
          ? {
              maxCpm: 220,
              maxSingleSpendPct: 0.3,
              mix: { 头部: 1, 腰部: 9, 长尾: 8 },
              note: "中小预算以腰部长尾为主，头部只做少量背书测试。",
            }
          : data.budgetRmb < 300000
            ? {
                maxCpm: 320,
                maxSingleSpendPct: 0.35,
                mix: { 头部: 3, 腰部: 11, 长尾: 6 },
                note: "中等预算采用少量头部建立认知，腰部承担主要触达。",
              }
            : {
                maxCpm: 520,
                maxSingleSpendPct: 0.45,
                mix: { 头部: 4, 腰部: 12, 长尾: 8 },
                note: "大预算采用头部建立声量，腰部放量，长尾做效率和人群测试。",
              };
    const targetMix =
      data.targetTier === "头部"
        ? { 头部: Math.max(3, budgetProfile.mix.头部), 腰部: 8, 长尾: 3 }
        : data.targetTier === "腰部"
          ? { 头部: Math.min(1, budgetProfile.mix.头部), 腰部: 13, 长尾: 5 }
          : data.targetTier === "长尾"
            ? { 头部: 0, 腰部: 5, 长尾: 14 }
            : budgetProfile.mix;

    const enriched = (pods ?? [])
      .map((p) => ({ pod: p, evidence: podcastEvidence(p) }))
      .filter(({ evidence }) => evidence.eligible)
      .map(({ pod: p, evidence }) => {
        const reach = estimateReach(p);
        const cpm = estimateCpm(p);
        const tier = classifyTier(p);
        const oneEpisodeCost = Math.round((reach / 1000) * cpm);
        const affordable = oneEpisodeCost <= data.budgetRmb * budgetProfile.maxSingleSpendPct;
        const briefMatch = briefMatchEvidence(p);
        return {
          ...p,
          reach,
          cpm,
          tier,
          oneEpisodeCost,
          affordable,
          sourceBasis: evidence.basis,
          briefMatchScore: briefMatch.score,
          briefMatchReasons: briefMatch.reasons,
          briefMatchRisks: briefMatch.risks,
        };
      })
      .filter((p) => (p.cpm <= budgetProfile.maxCpm || p.affordable) && p.briefMatchScore > -25);

    const scoreForPlan = (p: (typeof enriched)[number]) => {
      const efficiency = p.oneEpisodeCost > 0 ? Math.min(25, (data.budgetRmb / p.oneEpisodeCost) * 0.8) : 0;
      const reachScore = Math.min(30, Math.log10(Math.max(10, p.reach)) * 6);
      const sourceTrust = p.xiaoyuzhou_subscribers ? 22 : 0;
      const nativePodcastSignal = /播客|podcast|fm|访谈|对谈|圆桌|会客厅|聊天室|谈话|talk|radio/i.test(
        `${p.title ?? ""} ${p.author ?? ""}`,
      )
        ? 10
        : 0;
      const contentIpPenalty = /小沈龙|吴晓波|历史脱口秀|故事|段子|笑话|说书|解读/i.test(
        `${p.title ?? ""} ${p.author ?? ""}`,
      )
        ? -35
        : 0;
      const quality =
        (p.commercial_score ?? 50) * 0.45 +
        (p.activity_score ?? 50) * 0.2 +
        (p.growth_score ?? 50) * 0.15;
      const affordability = p.affordable ? 20 : -30;
      const longTailBonus = p.tier === "长尾" ? 18 : 0;
      return (
        quality +
        efficiency +
        reachScore +
        sourceTrust +
        nativePodcastSignal +
        affordability +
        longTailBonus +
        contentIpPenalty +
        p.briefMatchScore
      );
    };

    const byTier = (tier: CandidateTier) =>
      enriched.filter((p) => p.tier === tier).sort((a, b) => scoreForPlan(b) - scoreForPlan(a));
    const seen = new Set<string>();
    const baseCandidates = (["头部", "腰部", "长尾"] as CandidateTier[])
      .flatMap((tier) => {
        const limit = targetMix[tier];
        return byTier(tier)
          .filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          })
          .slice(0, limit);
      })
      .slice(0, 24);
    const ximalayaNativeCandidates =
      data.budgetRmb >= 100000
        ? enriched
            .filter((p) => !p.xiaoyuzhou_subscribers && Boolean(p.ximalaya_subscribers || p.ximalaya_plays))
            .sort((a, b) => scoreForPlan(b) - scoreForPlan(a))
            .slice(0, data.budgetRmb >= 300000 ? 4 : 2)
        : [];
    const candidates = [...baseCandidates, ...ximalayaNativeCandidates.filter((p) => !seen.has(p.id))]
      .filter((p) => {
        if (seen.has(`candidate:${p.id}`)) return false;
        seen.add(`candidate:${p.id}`);
        return true;
      })
      .slice(0, 28);
    const minimumSelection =
      data.budgetRmb >= 300000
        ? { total: 10, 头部: 2, 腰部: 5, 长尾: 3 }
        : data.budgetRmb >= 100000
          ? { total: 7, 头部: 1, 腰部: 4, 长尾: 2 }
          : data.budgetRmb >= 30000
            ? { total: 5, 头部: 0, 腰部: 3, 长尾: 2 }
            : { total: 4, 头部: 0, 腰部: 1, 长尾: 3 };

    const inventoryText = candidates
      .map(
        (p, i) =>
          `${i + 1}. [${p.id}] ${p.title}｜层级：${p.tier}｜${p.category ?? "未分类"}｜标签：${(p.audience_tags ?? []).slice(0, 4).join("/") || "无"}｜商业${p.commercial_score}/活跃${p.activity_score}/增长${p.growth_score}｜预估触达 ${p.reach}｜建议CPM ¥${p.cpm}｜单集预估成本 ¥${p.oneEpisodeCost}｜${p.affordable ? "预算友好" : "单档偏贵"}｜小宇宙订阅 ${p.xiaoyuzhou_subscribers ?? "?"}｜喜马拉雅订阅 ${p.ximalaya_subscribers ?? "?"}｜播放 ${p.ximalaya_plays ?? "?"}｜播客形态依据：${p.sourceBasis}｜Brief匹配：${p.briefMatchReasons.join("、") || "通用匹配"}｜风险：${p.briefMatchRisks.join("、") || "无明显风险"}`,
      )
      .join("\n");
    const candidateRecommendationBasis = candidates.slice(0, 12).map((p) => ({
      podcast_id: p.id,
      title: p.title,
      tier: p.tier,
      category: p.category,
      estimated_reach: p.reach,
      estimated_cpm_rmb: p.cpm,
      reasons: p.briefMatchReasons,
      risks: p.briefMatchRisks,
      source_basis: p.sourceBasis,
    }));
    const briefMatchSummary = [
      activeBriefProfiles.length
        ? `识别品牌方向：${activeBriefProfiles.map((profile) => profile.key).join("、")}`
        : "未识别到强行业关键词，采用通用品牌安全池",
      goalProfile.note,
      `预算 ${data.budgetRmb.toLocaleString()} 元，单档上限 ${Math.round(budgetProfile.maxSingleSpendPct * 100)}%，优先保证头部/腰部/长尾结构。`,
    ].join(" ");

    const prompt = `你是一位资深中文播客广告投放规划师，正在为以下品牌做投放方案规划。

【品牌信息】
- 品牌：${data.brandName}
- 产品描述：${data.productDescription}
- 投放目的：${data.goal}
- 预算（人民币）：¥${data.budgetRmb.toLocaleString()}
- 目标层级：${data.targetTier}
${data.audienceNotes ? `- 目标人群补充：${data.audienceNotes}` : ""}
- 预算策略：${budgetProfile.note}
- Brief匹配口径：${briefMatchSummary}
- 单档预算上限：任何单个播客建议花费不应超过总预算的 ${Math.round(budgetProfile.maxSingleSpendPct * 100)}%
- 本预算规模的最低组合要求：至少 ${minimumSelection.total} 档，其中头部不少于 ${minimumSelection.头部} 档、腰部不少于 ${minimumSelection.腰部} 档、长尾不少于 ${minimumSelection.长尾} 档。

【当前可投放播客库存 Top ${candidates.length}】
${inventoryText || "（暂无符合层级的播客，请给出通用建议）"}

请基于上述真实库存，一次性规划 Plan A / Plan B / Plan C 三套方案。三套方案必须对应不同投放目的与效果预期：
- Plan A：低预期 / 稳健测试，目标是用更低风险验证人群与素材。
- Plan B：中预期 / 均衡放量，目标是在可控成本下兼顾触达和转化。
- Plan C：高预期 / 声量冲刺，目标是在预算允许范围内争取更高品牌声量。

严格按以下 JSON Schema 返回（不要任何额外文字或 markdown）：
{
  "strategy_summary": "120 字以内的整体策略概述",
  "recommended_format": "推荐的主投形式（口播/中插/冠名/定制单集）及原因",
  "scenario_plans": [
    {
      "plan_label": "Plan A",
      "objective": "本方案的具体投放目的",
      "expectation_level": "低预期",
      "expected_effect": "预期能达到什么效果（40字内）",
      "recommended_format": "推荐的主投形式及原因",
      "budget_allocation": [
        { "bucket": "类别名（如：腰部口播 / 长尾测试 / 平台覆盖）", "amount_rmb": 数字, "percentage": 数字, "rationale": "原因（30字内）" }
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
      "decision_rule": "用什么指标判断是否进入下一步（40字内）",
      "next_steps": ["第 1 步投放动作", "第 2 步投放动作"],
      "risk_warnings": ["风险点 1", "风险点 2"]
    },
    { "plan_label": "Plan B", "objective": "...", "expectation_level": "中预期", "expected_effect": "...", "recommended_format": "...", "budget_allocation": [], "selected_podcasts": [], "kpi_forecast": {}, "timeline_weeks": 数字, "decision_rule": "...", "next_steps": [], "risk_warnings": [] },
    { "plan_label": "Plan C", "objective": "...", "expectation_level": "高预期", "expected_effect": "...", "recommended_format": "...", "budget_allocation": [], "selected_podcasts": [], "kpi_forecast": {}, "timeline_weeks": 数字, "decision_rule": "...", "next_steps": [], "risk_warnings": [] }
  ],
  "budget_allocation": [
    { "bucket": "兼容旧版字段：可复制 Plan B 的预算分配", "amount_rmb": 数字, "percentage": 数字, "rationale": "原因（30字内）" }
  ],
  "selected_podcasts": [
    { "podcast_id": "兼容旧版字段：可复制 Plan B 的播客组合", "title": "播客名", "suggested_format": "口播/中插/冠名", "estimated_cpm_rmb": 数字, "estimated_episodes": 数字, "expected_reach": 数字, "fit_reason": "为什么选它（30字内）" }
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
- 必须返回且只返回 3 个 scenario_plans，plan_label 分别为 Plan A、Plan B、Plan C。
- 每个 scenario_plans[*].selected_podcasts 必须从上方库存中选择，podcast_id 直接复制上方括号中的完整 UUID。
- Plan A 可少于基准组合但至少 ${Math.max(4, minimumSelection.total - 3)} 档；Plan B 不得少于 ${minimumSelection.total} 档；Plan C 应不少于 ${minimumSelection.total} 档且更偏声量。
- Plan B 和 Plan C 必须同时覆盖头部、腰部、长尾（除非库存中对应层级为空）。
- 每个入选播客的 fit_reason 必须同时说明“与本品牌 Brief 的匹配点”和“预算/层级角色”，不能只写泛泛的流量大。
- 每个入选播客都要参考“播客形态依据”和“Brief匹配”；可以选择喜马拉雅原生播客，但不能选择有声书、课程、小说、合集、纯享片段、视频版、听友个人专辑。
- 如果库存中有喜马拉雅原生播客且入选依据充分，大预算方案应至少纳入 1 档作为平台覆盖测试。
- 每套方案的 budget_allocation 总和都应等于总预算。
- 每套方案 selected_podcasts 的 estimated_episodes * expected_reach / 1000 * estimated_cpm_rmb 之和不得超过总预算，且每个播客不得超过单档预算上限。
- Plan A / B / C 的 KPI 应呈现低 / 中 / 高三档预期差异，下一步动作要说明“若达到/未达到指标，下一步到两步怎么投放”。
- 如果预算低于 3 万，不要选择头部播客；如果预算低于 10 万，头部预算占比不得超过 20%。
- 除非用户明确选择头部，大多数方案应包含腰部和长尾播客，用它们承担测试和转化效率。
- 所有金额按人民币元。`;

    const ai = await callAi(
      [
        { role: "system", content: "你是中文播客广告投放规划专家，只输出严格 JSON。" },
        { role: "user", content: prompt },
      ],
      { json: true, modelEnvName: "AI_PLANNER_MODEL" },
    );
    const raw = ai.content;
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("AI 返回格式无法解析");
    const plan = parsed as Record<string, unknown>;

    const candidateById = new Map(candidates.map((p) => [p.id, p]));
    const makeFitReason = (p: (typeof candidates)[number]) => {
      const reasons = p.briefMatchReasons.length ? p.briefMatchReasons.join("、") : "通用品牌安全";
      const role =
        p.tier === "头部"
          ? "承担声量背书"
          : p.tier === "腰部"
            ? "承担主要触达与转化测试"
            : "承担低成本人群测试";
      return `${reasons}，${p.tier}${role}`;
    };
    const tierCount = (rows: Array<Record<string, unknown>>, tier: CandidateTier) =>
      rows.filter((row) => {
        const id = typeof row.podcast_id === "string" ? row.podcast_id : "";
        return candidateById.get(id)?.tier === tier;
      }).length;

    const repairSelectedPodcasts = (
      node: Record<string, unknown>,
      min: { total: number; 头部: number; 腰部: number; 长尾: number },
      requireXimalayaNative: boolean,
    ) => {
      const selected = Array.isArray(node.selected_podcasts)
        ? (node.selected_podcasts as Array<Record<string, unknown>>)
        : [];
      const selectedIds = new Set(
        selected.map((row) => (typeof row.podcast_id === "string" ? row.podcast_id : null)).filter(Boolean),
      );
      const validSelected = selected
        .filter((row) => typeof row.podcast_id === "string" && candidateById.has(row.podcast_id))
        .map((row) => {
          const p = candidateById.get(row.podcast_id as string);
          const rawReason = typeof row.fit_reason === "string" ? row.fit_reason.trim() : "";
          if (!p || (rawReason && !/流量大|匹配|预算|层级|转化|声量|测试/.test(rawReason))) return row;
          return {
            ...row,
            fit_reason: p ? makeFitReason(p) : rawReason,
          };
        });
      const topUpRows: Array<Record<string, unknown>> = [];
      const addFallback = (tier: CandidateTier, count: number) => {
      if (count <= 0) return;
      for (const p of byTier(tier)) {
        if (selectedIds.has(p.id)) continue;
        selectedIds.add(p.id);
        topUpRows.push({
          podcast_id: p.id,
          title: p.title,
          suggested_format: tier === "头部" ? "冠名/深度口播" : tier === "腰部" ? "口播/中插" : "测试口播",
          estimated_cpm_rmb: p.cpm,
          estimated_episodes: 1,
          expected_reach: p.reach,
          fit_reason: makeFitReason(p),
        });
        count -= 1;
        if (count <= 0) break;
      }
    };
      const addXimalayaNativeFallback = () => {
        for (const p of ximalayaNativeCandidates) {
          if (selectedIds.has(p.id)) continue;
          selectedIds.add(p.id);
          topUpRows.push({
            podcast_id: p.id,
            title: p.title,
            suggested_format: p.tier === "头部" ? "深度口播" : p.tier === "腰部" ? "口播/中插" : "测试口播",
            estimated_cpm_rmb: p.cpm,
            estimated_episodes: 1,
            expected_reach: p.reach,
            fit_reason: `${makeFitReason(p)}，补充喜马拉雅平台覆盖`,
          });
          break;
        }
      };
      addFallback("头部", min.头部 - tierCount(validSelected, "头部"));
      addFallback("腰部", min.腰部 - tierCount(validSelected, "腰部"));
      addFallback("长尾", min.长尾 - tierCount(validSelected, "长尾"));
      for (const tier of ["腰部", "长尾", "头部"] as CandidateTier[]) {
        if (validSelected.length + topUpRows.length >= min.total) break;
        addFallback(tier, min.total - validSelected.length - topUpRows.length);
      }
      const hasXimalayaNativeSelected = [...validSelected, ...topUpRows].some((row) => {
        const id = typeof row.podcast_id === "string" ? row.podcast_id : "";
        const p = candidateById.get(id);
        return Boolean(p && !p.xiaoyuzhou_subscribers && (p.ximalaya_subscribers || p.ximalaya_plays));
      });
      if (requireXimalayaNative && ximalayaNativeCandidates.length && !hasXimalayaNativeSelected) {
        addXimalayaNativeFallback();
      }
      if (topUpRows.length || validSelected.length !== selected.length) {
        node.selected_podcasts = [...validSelected, ...topUpRows];
        const warnings = Array.isArray(node.risk_warnings) ? node.risk_warnings : [];
        node.risk_warnings = [
          ...warnings,
          "系统已按预算规模补齐头部/腰部/长尾组合，并过滤非播客候选。",
        ];
      }
    };

    const scenarioPlans = Array.isArray(plan.scenario_plans)
      ? (plan.scenario_plans as Array<Record<string, unknown>>)
      : [];
    const scenarioMinimums = [
      { total: Math.max(4, minimumSelection.total - 3), 头部: 0, 腰部: Math.max(1, minimumSelection.腰部 - 2), 长尾: 2 },
      minimumSelection,
      { total: minimumSelection.total + 2, 头部: Math.max(1, minimumSelection.头部), 腰部: minimumSelection.腰部, 长尾: minimumSelection.长尾 },
    ];
    if (scenarioPlans.length) {
      scenarioPlans.slice(0, 3).forEach((scenario, index) => {
        repairSelectedPodcasts(
          scenario,
          scenarioMinimums[index] ?? minimumSelection,
          data.budgetRmb >= 300000 && index >= 1,
        );
      });
      const middlePlan = scenarioPlans[1] ?? scenarioPlans[0];
      plan.budget_allocation = middlePlan.budget_allocation;
      plan.selected_podcasts = middlePlan.selected_podcasts;
      plan.kpi_forecast = middlePlan.kpi_forecast;
      plan.timeline_weeks = middlePlan.timeline_weeks;
      plan.risk_warnings = middlePlan.risk_warnings;
      plan.next_steps = middlePlan.next_steps;
    } else {
      repairSelectedPodcasts(plan, minimumSelection, data.budgetRmb >= 300000);
    }

    plan.brief_match_summary = briefMatchSummary;
    plan.candidate_recommendation_basis = candidateRecommendationBasis;
    plan.excluded_candidates = excludedCandidateSamples;

    return {
      plan,
      inventorySize: candidates.length,
      budgetProfile,
      model: ai.model,
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
  .inputValidator((input: unknown) => z.object({ podcastId: z.string().uuid() }).parse(input))
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

    const ai = await callAi(
      [
        {
          role: "system",
          content: "You are a senior US podcast ad strategist. Output strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      { json: true, modelEnvName: "AI_STRATEGY_MODEL" },
    );
    const raw = ai.content;
    const parsed = safeParseJson(raw) as OverseasStrategy | null;
    if (!parsed) throw new Error("AI returned unparsable JSON");

    await supabaseAdmin
      .from("podcasts")
      .update({
        ai_strategy: parsed as unknown as never,
        ai_strategy_at: new Date().toISOString(),
      })
      .eq("id", data.podcastId);

    await supabaseAdmin.from("brand_recommendations").delete().eq("podcast_id", data.podcastId);

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

    const ai = await callAi(
      [
        {
          role: "system",
          content: "You are a cross-border podcast ad strategist. Output strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      { json: true, modelEnvName: "AI_PLANNER_MODEL" },
    );
    const raw = ai.content;
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("AI returned unparsable JSON");

    return {
      plan: parsed,
      inventorySize: candidates.length,
      model: ai.model,
    };
  });
