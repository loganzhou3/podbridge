import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

function loadDotenv(path = ".env") {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function signXimalayaParams(params, appSecret) {
  const sorted = Object.entries(params)
    .filter(([, value]) => value !== "" && value != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("md5").update(`${appSecret}${sorted}${appSecret}`).digest("hex");
}

function stripHtml(value) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, "").trim() : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
  return res.json();
}

async function searchAlbums(query) {
  const url = new URL("https://search.ximalaya.com/front/v1");
  url.searchParams.set("core", "album");
  url.searchParams.set("kw", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("rows", "5");
  const payload = await fetchJson(url);
  return (payload.response?.docs ?? []).map((doc) => ({
    id: String(doc.id ?? ""),
    title: stripHtml(doc.title) ?? stripHtml(doc.highLightTitle),
    author: stripHtml(doc.nickname),
    subscribers: doc.count_subscribe ?? null,
    plays: doc.play ?? null,
    tracks: doc.tracks ?? null,
    url: doc.id ? `https://www.ximalaya.com/album/${doc.id}` : null,
  }));
}

async function fetchAlbum(albumId) {
  const url = new URL("https://mobile.ximalaya.com/mobile/v1/album");
  url.searchParams.set("device", "android");
  url.searchParams.set("albumId", albumId);
  return fetchJson(url);
}

async function fetchTracks(albumId) {
  const url = new URL("https://mobile.ximalaya.com/mobile/v1/album/track");
  url.searchParams.set("device", "android");
  url.searchParams.set("albumId", albumId);
  url.searchParams.set("pageId", "1");
  url.searchParams.set("pageSize", "20");
  return fetchJson(url);
}

loadDotenv();

const query = process.argv.slice(2).join(" ").trim() || "商业就是这样";
const hasCredentials = Boolean(process.env.XIMALAYA_APP_KEY && process.env.XIMALAYA_APP_SECRET);
const signatureSample = hasCredentials
  ? signXimalayaParams(
      {
        app_key: process.env.XIMALAYA_APP_KEY,
        client_os_type: 4,
        nonce: "podbridge",
        timestamp: 1710000000000,
      },
      process.env.XIMALAYA_APP_SECRET,
    )
  : null;

console.log(
  JSON.stringify(
    {
      query,
      officialCredentialsDetected: hasCredentials,
      signatureHelperReady: Boolean(signatureSample),
      signatureSampleLength: signatureSample?.length ?? 0,
    },
    null,
    2,
  ),
);

const hits = await searchAlbums(query);
console.log(JSON.stringify({ publicSearchHits: hits }, null, 2));

const firstId = hits.find((hit) => hit.id)?.id;
if (firstId) {
  const album = await fetchAlbum(firstId);
  const tracks = await fetchTracks(firstId);
  const albumData = album.data && typeof album.data === "object" ? album.data : album.album;
  const albumInfo = albumData?.album && typeof albumData.album === "object" ? albumData.album : albumData;
  const embeddedTracks =
    albumData?.tracks && typeof albumData.tracks === "object" && Array.isArray(albumData.tracks.list)
      ? albumData.tracks.list
      : [];
  const trackList =
    tracks.data && typeof tracks.data === "object" && Array.isArray(tracks.data.list)
      ? tracks.data.list
      : Array.isArray(tracks.list)
        ? tracks.list
        : embeddedTracks;
  console.log(
    JSON.stringify(
      {
        selectedAlbumId: firstId,
        albumFields: albumInfo ? Object.keys(albumInfo).slice(0, 40) : Object.keys(album).slice(0, 40),
        firstTrackFields: trackList[0] ? Object.keys(trackList[0]).slice(0, 40) : [],
        trackCountReturned: trackList.length,
        usableForPodBridge: [
          "节目名称/主播/简介/封面",
          "订阅或关注量",
          "总播放量",
          "单集数量",
          "最新 20 集标题与更新时间",
          "喜马拉雅主页 URL 证据",
        ],
      },
      null,
      2,
    ),
  );
}
