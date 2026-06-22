import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ingestFromPlatformUrl } from "@/lib/insights.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RadioTower } from "lucide-react";
import { toast } from "sonner";

const isPlatformUrl = (value: string) =>
  /xiaoyuzhoufm\.com\/podcast\//i.test(value) || /ximalaya\.com\/(album|podcast)\//i.test(value);

export function PlatformIngestForm({ market = "cn" }: { market?: "cn" | "na" }) {
  const ingest = useServerFn(ingestFromPlatformUrl);
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (!isPlatformUrl(value)) {
      toast.error("请粘贴小宇宙节目主页或喜马拉雅专辑主页");
      return;
    }
    setLoading(true);
    try {
      const res = await ingest({ data: { url: value, market } });
      if (res.ok === false) {
        toast.error(res.error);
        return;
      }
      toast.success("平台数据已导入");
      navigate({ to: "/podcast/$id", params: { id: res.podcastId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
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
        placeholder="粘贴小宇宙 / 喜马拉雅主页，例如 https://www.ximalaya.com/album/12345678"
      />
      <Button type="submit" disabled={loading} style={{ background: "var(--gradient-brand)" }}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RadioTower className="h-4 w-4" />
        )}
        导入平台数据
      </Button>
    </form>
  );
}
