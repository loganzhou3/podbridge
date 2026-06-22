import { createHash } from "node:crypto";

export type XimalayaOpenConfig = {
  appKey: string;
  appSecret: string;
};

export type XimalayaAlbumSearchHit = {
  id: string;
  title: string;
  author: string | null;
  intro: string | null;
  coverUrl: string | null;
  url: string;
  subscriberCount: number | null;
  playCount: number | null;
  trackCount: number | null;
};

export function getXimalayaOpenConfig(): XimalayaOpenConfig | null {
  const appKey = process.env.XIMALAYA_APP_KEY;
  const appSecret = process.env.XIMALAYA_APP_SECRET;
  if (!appKey || !appSecret) return null;
  return { appKey, appSecret };
}

export function signXimalayaParams(params: Record<string, string | number | boolean>, appSecret: string) {
  const sorted = Object.entries(params)
    .filter(([, value]) => value !== "" && value != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("md5").update(`${appSecret}${sorted}${appSecret}`).digest("hex");
}

function stripHtml(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, "").trim() : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function searchXimalayaPublicAlbums(query: string, limit = 10): Promise<XimalayaAlbumSearchHit[]> {
  const url = new URL("https://search.ximalaya.com/front/v1");
  url.searchParams.set("core", "album");
  url.searchParams.set("kw", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("rows", String(Math.min(Math.max(limit, 1), 30)));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
    },
  });
  if (!res.ok) throw new Error(`Ximalaya public search failed: ${res.status}`);
  const payload = (await res.json()) as { response?: { docs?: Array<Record<string, unknown>> } };
  return (payload.response?.docs ?? [])
    .map((doc) => {
      const id = doc.id == null ? null : String(doc.id);
      const title = stripHtml(doc.title) ?? stripHtml(doc.highLightTitle);
      if (!id || !title) return null;
      return {
        id,
        title,
        author: stripHtml(doc.nickname),
        intro: stripHtml(doc.intro),
        coverUrl: stripHtml(doc.cover_path) ?? stripHtml(doc.coverPath),
        url: `https://www.ximalaya.com/album/${id}`,
        subscriberCount: num(doc.count_subscribe),
        playCount: num(doc.play),
        trackCount: num(doc.tracks),
      };
    })
    .filter((hit): hit is XimalayaAlbumSearchHit => Boolean(hit))
    .slice(0, limit);
}

export async function fetchXimalayaMobileAlbum(albumId: string) {
  const url = new URL("https://mobile.ximalaya.com/mobile/v1/album");
  url.searchParams.set("device", "android");
  url.searchParams.set("albumId", albumId);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
    },
  });
  if (!res.ok) throw new Error(`Ximalaya album fetch failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchXimalayaMobileTracks(albumId: string, pageSize = 20) {
  const url = new URL("https://mobile.ximalaya.com/mobile/v1/album/track");
  url.searchParams.set("device", "android");
  url.searchParams.set("albumId", albumId);
  url.searchParams.set("pageId", "1");
  url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 50)));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PodBridge/1.0 (+https://github.com/loganzhou3/podbridge)",
    },
  });
  if (!res.ok) throw new Error(`Ximalaya tracks fetch failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}
