import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

const DEFAULT_INPUT =
  "/Users/pengyuyan/Documents/Codex/2026-05-20/apple-podcast/outputs/podcast_leads_pool_homepage_summary_trends_enhanced_2026-06-06.xlsx";

function loadEnv(file = ".env") {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    let value = s.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[s.slice(0, i)] = value;
  }
  return { ...env, ...process.env };
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const inputFile = argValue("--file") ?? DEFAULT_INPUT;
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");
const limit = Number(argValue("--limit") ?? 0) || Infinity;
const sqlOut = argValue("--sql-out");

function text(value) {
  const s = String(value ?? "").trim();
  return s && s !== "null" && s !== "undefined" ? s : null;
}

function num(value) {
  const s = text(value);
  if (!s) return null;
  const cleaned = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  let n = Number(cleaned[0]);
  if (s.includes("万")) n *= 10000;
  if (s.includes("亿")) n *= 100000000;
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseSeries(value) {
  const s = text(value);
  if (!s) return [];
  return s
    .split(/[;；,，\s]+/)
    .map(num)
    .filter((n) => n != null && n >= 0);
}

function avg(nums) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function sum(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function dateIso(value) {
  const s = text(value);
  if (!s || /待|未知|核验/.test(s)) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function normalizeUrl(value, platform) {
  const s = text(value);
  if (!s) return null;
  if (platform === "xiaoyuzhou") {
    const m = s.match(/https:\/\/www\.xiaoyuzhoufm\.com\/podcast\/[a-z0-9]+/i);
    return m?.[0] ?? null;
  }
  const m = s.match(/ximalaya\.com\/(?:album|podcast)\/(\d+)/i);
  return m ? `https://www.ximalaya.com/album/${m[1]}` : null;
}

function tierScore(tier) {
  const t = text(tier);
  if (t === "S") return { commercial: 90, growth: 75, lifecycle: "头部成熟期" };
  if (t === "A") return { commercial: 78, growth: 68, lifecycle: "成熟期" };
  if (t === "B") return { commercial: 62, growth: 58, lifecycle: "成长期" };
  return { commercial: 48, growth: 50, lifecycle: "观察期" };
}

function sourceRows(workbook, sheetName, platform) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false }).map((row) => ({
    sheetName,
    platform,
    title: text(row["节目名"]),
    category: text(row["分类"]),
    url: normalizeUrl(row["主页链接"], platform),
    subscribers: num(row["订阅"]),
    recentPlays: parseSeries(row["近3期播放"]),
    recentComments: parseSeries(row["近3期评论"]),
    latestEpisodeAt: dateIso(row["最近更新时间"]),
    contact: text(row["联系方式"]),
    commercialTrace: text(row["商业化痕迹"]),
    originalTier: text(row["A/B/C"] ?? row["原档位"]),
    tier: text(row["修正后档位"] ?? row["A/B/C"] ?? row["原档位"]),
    author: text(row["主播/出品方"]),
    influence: num(row["主播/出品方跨平台影响力"]),
    headFlag: text(row["头部播客主/矩阵标记"]),
    correction: text(row["修正说明"]),
    suggestion: text(row["资源池处理建议"]),
    brands: text(row["历史商务品牌"]),
    products: text(row["历史商务产品/服务"]),
    evidence: text(row["历史商务证据/Shownotes链接"]),
    commerceStatus: text(row["商务收集状态"]),
  }));
}

function dedupe(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.title || !row.url) continue;
    const key = `${row.platform}:${row.url}`;
    const prev = map.get(key);
    if (!prev || (row.subscribers ?? 0) > (prev.subscribers ?? 0)) {
      map.set(key, { ...prev, ...row });
    }
  }
  return [...map.values()];
}

function buildPodcastRow(item) {
  const scores = tierScore(item.tier);
  const recentAvgPlays = avg(item.recentPlays);
  const recentComments = sum(item.recentComments);
  const notes = {
    source_file: path.basename(inputFile),
    source_sheet: item.sheetName,
    platform: item.platform,
    contact: item.contact,
    commercial_trace: item.commercialTrace,
    tier: item.tier,
    original_tier: item.originalTier,
    influence: item.influence,
    head_flag: item.headFlag,
    correction: item.correction,
    suggestion: item.suggestion,
    historical_brands: item.brands,
    historical_products: item.products,
    evidence: item.evidence,
    commerce_status: item.commerceStatus,
    recent_plays: item.recentPlays,
    recent_comments: item.recentComments,
  };
  const base = {
    title: item.title,
    author: item.author,
    category: item.category,
    market: "cn",
    language: "zh-cn",
    latest_episode_at: item.latestEpisodeAt,
    episode_count: 0,
    commercial_score: scores.commercial,
    activity_score: recentAvgPlays
      ? Math.min(95, Math.max(45, Math.round(Math.log10(recentAvgPlays + 1) * 20)))
      : 50,
    growth_score: scores.growth,
    lifecycle_stage: scores.lifecycle,
    audience_tags: [
      item.platform === "xiaoyuzhou" ? "小宇宙" : "喜马拉雅",
      item.category,
      item.tier,
    ]
      .filter(Boolean)
      .slice(0, 8),
    monthly_active_listeners: recentAvgPlays,
    metrics_notes: JSON.stringify(notes).slice(0, 2000),
    metrics_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    xiaoyuzhou_url: null,
    xiaoyuzhou_subscribers: null,
    xiaoyuzhou_comments: null,
    ximalaya_url: null,
    ximalaya_subscribers: null,
    ximalaya_comments: null,
  };
  if (item.platform === "xiaoyuzhou") {
    return {
      ...base,
      xiaoyuzhou_url: item.url,
      xiaoyuzhou_subscribers: item.subscribers,
      xiaoyuzhou_comments: recentComments,
    };
  }
  return {
    ...base,
    ximalaya_url: item.url,
    ximalaya_subscribers: item.subscribers,
    ximalaya_comments: recentComments,
  };
}

function brandRows(item, podcastId) {
  const brands = (item.brands ?? "")
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/待|未找到|核验/.test(s));
  const products = (item.products ?? "").split(/[;；]/).map((s) => s.trim());
  const evidence = (item.evidence ?? "").split(/[;；]/).map((s) => s.trim());
  return brands.slice(0, 10).map((brand, i) => ({
    podcast_id: podcastId,
    brand_name: brand,
    category: products[i] || item.category || null,
    fit_score: item.tier === "S" ? 90 : item.tier === "A" ? 80 : 65,
    reason: [item.commercialTrace, evidence[i]].filter(Boolean).join(" | ").slice(0, 800) || null,
    contact_notes: item.contact,
    contacts_fetched_at: new Date().toISOString(),
  }));
}

function sqlLiteral(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (Array.isArray(value) || typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlArray(values) {
  const filtered = (values ?? []).filter(Boolean);
  if (!filtered.length) return "null";
  return `array[${filtered.map(sqlLiteral).join(",")}]::text[]`;
}

function rowSql(item) {
  const row = buildPodcastRow(item);
  const urlColumn = item.platform === "xiaoyuzhou" ? "xiaoyuzhou_url" : "ximalaya_url";
  const subscriberColumn =
    item.platform === "xiaoyuzhou" ? "xiaoyuzhou_subscribers" : "ximalaya_subscribers";
  const commentColumn =
    item.platform === "xiaoyuzhou" ? "xiaoyuzhou_comments" : "ximalaya_comments";
  const platformUrl = row[urlColumn];
  const subscribers = row[subscriberColumn];
  const comments = row[commentColumn];
  const brandPayload = JSON.stringify(
    brandRows(item, "00000000-0000-0000-0000-000000000000").map(({ podcast_id, ...rest }) => rest),
  ).replace(/'/g, "''");

  return `
-- ${item.platform}: ${item.title}
select id into v_podcast_id from public.podcasts where ${urlColumn} = ${sqlLiteral(platformUrl)} limit 1;

if v_podcast_id is null then
  insert into public.podcasts (
    title, author, category, market, language, latest_episode_at, episode_count,
    commercial_score, activity_score, growth_score, lifecycle_stage, audience_tags,
    monthly_active_listeners, metrics_notes, metrics_updated_at, last_synced_at, updated_at,
    ${urlColumn}, ${subscriberColumn}, ${commentColumn}
  ) values (
    ${sqlLiteral(row.title)}, ${sqlLiteral(row.author)}, ${sqlLiteral(row.category)}, 'cn', 'zh-cn',
    ${sqlLiteral(row.latest_episode_at)}, ${sqlLiteral(row.episode_count)},
    ${sqlLiteral(row.commercial_score)}, ${sqlLiteral(row.activity_score)}, ${sqlLiteral(row.growth_score)},
    ${sqlLiteral(row.lifecycle_stage)}, ${sqlArray(row.audience_tags)},
    ${sqlLiteral(row.monthly_active_listeners)}, ${sqlLiteral(row.metrics_notes)}::text,
    now(), now(), now(), ${sqlLiteral(platformUrl)}, ${sqlLiteral(subscribers)}, ${sqlLiteral(comments)}
  )
  returning id into v_podcast_id;
else
  update public.podcasts set
    title = ${sqlLiteral(row.title)},
    author = ${sqlLiteral(row.author)},
    category = ${sqlLiteral(row.category)},
    market = 'cn',
    language = 'zh-cn',
    latest_episode_at = ${sqlLiteral(row.latest_episode_at)},
    commercial_score = ${sqlLiteral(row.commercial_score)},
    activity_score = ${sqlLiteral(row.activity_score)},
    growth_score = ${sqlLiteral(row.growth_score)},
    lifecycle_stage = ${sqlLiteral(row.lifecycle_stage)},
    audience_tags = ${sqlArray(row.audience_tags)},
    monthly_active_listeners = ${sqlLiteral(row.monthly_active_listeners)},
    metrics_notes = ${sqlLiteral(row.metrics_notes)}::text,
    metrics_updated_at = now(),
    last_synced_at = now(),
    updated_at = now(),
    ${urlColumn} = ${sqlLiteral(platformUrl)},
    ${subscriberColumn} = ${sqlLiteral(subscribers)},
    ${commentColumn} = ${sqlLiteral(comments)}
  where id = v_podcast_id;
end if;

insert into public.snapshots (
  podcast_id, episode_count, estimated_subscribers, xiaoyuzhou_subscribers, ximalaya_plays
) values (
  v_podcast_id, 0, ${sqlLiteral(item.subscribers)},
  ${item.platform === "xiaoyuzhou" ? sqlLiteral(item.subscribers) : "null"}, null
);

for v_brand in select * from jsonb_array_elements('${brandPayload}'::jsonb) loop
  insert into public.brand_recommendations (
    podcast_id, brand_name, category, fit_score, reason, contact_notes, contacts_fetched_at
  ) values (
    v_podcast_id,
    v_brand->>'brand_name',
    v_brand->>'category',
    nullif(v_brand->>'fit_score', '')::integer,
    v_brand->>'reason',
    v_brand->>'contact_notes',
    now()
  );
end loop;
`;
}

function replaceSql() {
  if (!replace) return "";
  return `-- Replace current CN podcast pool before importing from the Excel source.
delete from public.brand_recommendations
where podcast_id in (select id from public.podcasts where market = 'cn');

delete from public.snapshots
where podcast_id in (select id from public.podcasts where market = 'cn');

delete from public.episodes
where podcast_id in (select id from public.podcasts where market = 'cn');

delete from public.podcasts
where market = 'cn';

`;
}

function writeSql(rows, outputPath) {
  const sql = `-- PodBridge podcast leads import
-- Source: ${inputFile}
-- Rows: ${rows.length}
-- Generated: ${new Date().toISOString()}

${replaceSql()}
do $$
declare
  v_podcast_id uuid;
  v_brand jsonb;
begin
${rows.map(rowSql).join("\n")}
end $$;
`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql);
}

async function findExisting(supabase, item) {
  const column = item.platform === "xiaoyuzhou" ? "xiaoyuzhou_url" : "ximalaya_url";
  const { data, error } = await supabase
    .from("podcasts")
    .select("id")
    .eq(column, item.url)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function importOne(supabase, item) {
  const row = buildPodcastRow(item);
  const id = await findExisting(supabase, item);
  const write = id
    ? await supabase.from("podcasts").update(row).eq("id", id).select("id").single()
    : await supabase.from("podcasts").insert(row).select("id").single();
  if (write.error) throw write.error;
  const podcastId = write.data.id;

  const snapshot = {
    podcast_id: podcastId,
    episode_count: 0,
    estimated_subscribers: item.subscribers,
    xiaoyuzhou_subscribers: item.platform === "xiaoyuzhou" ? item.subscribers : null,
    ximalaya_plays: null,
  };
  const snap = await supabase.from("snapshots").insert(snapshot);
  if (snap.error) throw snap.error;

  const recs = brandRows(item, podcastId);
  if (recs.length) {
    const inserted = await supabase.from("brand_recommendations").insert(recs);
    if (inserted.error) throw inserted.error;
  }

  return { id: podcastId, mode: id ? "updated" : "inserted" };
}

async function replaceCurrentCnPool(supabase) {
  const { data: pods, error } = await supabase.from("podcasts").select("id").eq("market", "cn");
  if (error) throw error;
  const ids = (pods ?? []).map((p) => p.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const table of ["brand_recommendations", "snapshots", "episodes"]) {
      const deleted = await supabase.from(table).delete().in("podcast_id", chunk);
      if (deleted.error) throw deleted.error;
    }
  }
  const deletedPods = await supabase.from("podcasts").delete().eq("market", "cn");
  if (deletedPods.error) throw deletedPods.error;
  return ids.length;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function insertRows(supabase, table, rows, batchSize = 500, select = null) {
  const insertedRows = [];
  let inserted = 0;
  for (const [batchIndex, batch] of chunk(rows, batchSize).entries()) {
    let query = supabase.from(table).insert(batch);
    if (select) query = query.select(select);
    const { data, error } = await query;
    if (error) throw error;
    if (data) insertedRows.push(...data);
    inserted += batch.length;
    console.log(JSON.stringify({ table, batch: batchIndex + 1, inserted }));
  }
  return insertedRows;
}

async function importReplaceBatch(supabase, rows) {
  const result = {
    inserted: 0,
    updated: 0,
    failed: 0,
    failures: [],
    snapshots: 0,
    brandRecommendations: 0,
  };
  result.replacedCnPodcasts = await replaceCurrentCnPool(supabase);
  console.log(JSON.stringify({ replacedCnPodcasts: result.replacedCnPodcasts }));

  const podcastRows = rows.map(buildPodcastRow);
  const insertedPodcasts = await insertRows(
    supabase,
    "podcasts",
    podcastRows,
    500,
    "id,xiaoyuzhou_url,ximalaya_url",
  );
  result.inserted = insertedPodcasts.length;

  const idByUrl = new Map();
  for (const row of insertedPodcasts) {
    if (row.xiaoyuzhou_url) idByUrl.set(`xiaoyuzhou:${row.xiaoyuzhou_url}`, row.id);
    if (row.ximalaya_url) idByUrl.set(`ximalaya:${row.ximalaya_url}`, row.id);
  }

  const snapshots = [];
  const recommendations = [];
  for (const item of rows) {
    const podcastId = idByUrl.get(`${item.platform}:${item.url}`);
    if (!podcastId) {
      result.failed += 1;
      if (result.failures.length < 20) {
        result.failures.push({
          title: item.title,
          url: item.url,
          message: "Inserted podcast id was not returned",
        });
      }
      continue;
    }
    snapshots.push({
      podcast_id: podcastId,
      episode_count: 0,
      estimated_subscribers: item.subscribers,
      xiaoyuzhou_subscribers: item.platform === "xiaoyuzhou" ? item.subscribers : null,
      ximalaya_plays: null,
    });
    recommendations.push(...brandRows(item, podcastId));
  }

  await insertRows(supabase, "snapshots", snapshots, 1000);
  result.snapshots = snapshots.length;

  if (recommendations.length) {
    await insertRows(supabase, "brand_recommendations", recommendations, 500);
    result.brandRecommendations = recommendations.length;
  }

  return result;
}

const env = loadEnv();
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ??
  env.SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_PUBLISHABLE_KEY");
}

const workbook = xlsx.readFile(inputFile, { cellDates: true });
const rows = dedupe([
  ...sourceRows(workbook, "小宇宙", "xiaoyuzhou"),
  ...sourceRows(workbook, "喜马拉雅", "ximalaya"),
  ...sourceRows(workbook, "头部主甄别修正", "ximalaya"),
  ...sourceRows(workbook, "头部主甄别修正", "xiaoyuzhou"),
]).slice(0, limit);

const counts = rows.reduce(
  (acc, row) => {
    acc[row.platform] = (acc[row.platform] ?? 0) + 1;
    return acc;
  },
  { total: rows.length },
);
console.log(
  JSON.stringify({ inputFile, dryRun, replace, counts, sample: rows.slice(0, 3) }, null, 2),
);

if (sqlOut) {
  writeSql(rows, sqlOut);
  console.log(JSON.stringify({ sqlOut, rows: rows.length }, null, 2));
}

if (dryRun) process.exit(0);

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not configured; publishable key writes may be blocked by RLS.",
  );
  if (replace) {
    throw new Error(
      "--replace requires SUPABASE_SERVICE_ROLE_KEY. Use --replace --dry-run --sql-out and run the SQL in Supabase SQL Editor instead.",
    );
  }
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const result = { inserted: 0, updated: 0, failed: 0, failures: [] };
if (replace) {
  console.log(JSON.stringify(await importReplaceBatch(supabase, rows), null, 2));
  process.exit(0);
}
if (replace) {
  result.replacedCnPodcasts = await replaceCurrentCnPool(supabase);
  console.log(JSON.stringify({ replacedCnPodcasts: result.replacedCnPodcasts }));
}
for (const [index, item] of rows.entries()) {
  try {
    const write = await importOne(supabase, item);
    result[write.mode] += 1;
  } catch (error) {
    result.failed += 1;
    if (result.failures.length < 20) {
      result.failures.push({
        index,
        title: item.title,
        url: item.url,
        message: error?.message ?? String(error),
        code: error?.code,
      });
    }
  }
  if ((index + 1) % 100 === 0) console.log(JSON.stringify({ progress: index + 1, ...result }));
}

console.log(JSON.stringify(result, null, 2));
