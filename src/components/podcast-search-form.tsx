import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ingestPodcast, searchPodcasts } from "@/lib/podcast.functions";
import { ingestFromPlatformUrl, searchPodcastsAllPlatforms } from "@/lib/insights.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

type SearchResult = {
  platform: "apple" | "xiaoyuzhou" | "ximalaya";
  id: string;
  title: string;
  author: string | null;
  url: string;
  feedUrl: string | null;
  artwork: string | null;
  genre?: string | null;
  trackCount?: number | null;
};

export function PodcastSearchForm({ market = "cn" }: { market?: "cn" | "na" }) {
  const searchApple = useServerFn(searchPodcasts);
  const searchAll = useServerFn(searchPodcastsAllPlatforms);
  const ingest = useServerFn(ingestPodcast);
  const ingestPlatform = useServerFn(ingestFromPlatformUrl);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [ingestingId, setIngestingId] = useState<string | null>(null);

  const isNA = market === "na";
  const placeholder = isNA
    ? "Search a podcast by name, e.g. Huberman Lab"
    : "搜索小宇宙/喜马拉雅节目名，例如：日谈公园、商业就是这样";

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res =
        market === "cn"
          ? await searchAll({ data: { query: query.trim(), market, limit: 8 } })
          : await searchApple({ data: { query: query.trim(), market, limit: 8 } });
      const normalized: SearchResult[] = res.results.map((r) => ({
        platform: "platform" in r ? r.platform : "apple",
        id: r.id,
        title: r.title,
        author: r.author,
        url: "url" in r ? r.url : r.feedUrl,
        feedUrl: r.feedUrl,
        artwork: "artwork" in r ? r.artwork : null,
        genre: "genre" in r ? r.genre : null,
        trackCount: "trackCount" in r ? r.trackCount : null,
      }));
      if (normalized.length === 0) {
        toast.message(isNA ? "No results" : "未找到匹配的播客，换个关键词试试");
      }
      setResults(normalized);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSearching(false);
    }
  };

  const onPick = async (r: SearchResult) => {
    setIngestingId(r.id);
    try {
      const res =
        r.platform === "apple" && r.feedUrl
          ? await ingest({ data: { rssUrl: r.feedUrl, market } })
          : await ingestPlatform({ data: { url: r.url, market } });
      if (res.ok === false) {
        toast.error(res.error);
        return;
      }
      toast.success(isNA ? "Analysis complete" : "分析完成");
      navigate({ to: "/podcast/$id", params: { id: res.podcastId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setIngestingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex w-full gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
        <Button type="submit" disabled={searching} variant="secondary">
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span>{isNA ? "Search" : "搜索"}</span>
        </Button>
      </form>

      {results.length > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
              {r.artwork ? (
                <img
                  src={r.artwork}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.platform === "xiaoyuzhou"
                    ? "小宇宙"
                    : r.platform === "ximalaya"
                      ? "喜马拉雅"
                      : "Apple"}
                  {r.author ? ` · ${r.author}` : ""}
                  {r.genre ? ` · ${r.genre}` : ""}
                  {r.trackCount ? ` · ${r.trackCount} ${isNA ? "eps" : "集"}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onPick(r)}
                disabled={ingestingId !== null}
                style={{ background: "var(--gradient-brand)" }}
              >
                {ingestingId === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{isNA ? "Analyze" : "分析"}</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
