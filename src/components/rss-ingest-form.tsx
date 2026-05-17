import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ingestPodcast } from "@/lib/podcast.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function RssIngestForm({ size = "default" }: { size?: "default" | "lg" }) {
  const ingest = useServerFn(ingestPodcast);
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await ingest({ data: { rssUrl: url.trim() } });
      toast.success("分析完成");
      navigate({ to: "/podcast/$id", params: { id: res.podcastId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "解析失败";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full gap-2">
      <Input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="粘贴播客 RSS 链接，例如 https://feeds.example.com/podcast.xml"
        className={size === "lg" ? "h-12 text-base" : ""}
      />
      <Button
        type="submit"
        disabled={loading}
        className={size === "lg" ? "h-12 px-6" : ""}
        style={{ background: "var(--gradient-brand)" }}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>分析中</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>开始分析</span>
          </>
        )}
      </Button>
    </form>
  );
}
