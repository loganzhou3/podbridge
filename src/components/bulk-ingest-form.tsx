import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { ingestPodcast } from "@/lib/podcast.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Result = { url: string; status: "pending" | "ok" | "fail"; message?: string };

export function BulkIngestForm({ market = "cn" }: { market?: "cn" | "na" }) {
  const ingest = useServerFn(ingestPodcast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(0);

  const isUrl = (s: string) => /^https?:\/\//i.test(s);

  const extractUrls = (raw: string): string[] => {
    const urls = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(isUrl);
    return Array.from(new Set(urls));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const collected: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
        for (const row of rows) {
          for (const cell of row) {
            const s = String(cell ?? "").trim();
            if (isUrl(s)) collected.push(s);
          }
        }
      }
      const unique = Array.from(new Set(collected));
      if (unique.length === 0) {
        toast.error(market === "na" ? "No RSS URLs found in file" : "文件中未找到 RSS 链接");
        return;
      }
      setText((prev) => {
        const merged = Array.from(new Set([...extractUrls(prev), ...unique]));
        return merged.join("\n");
      });
      toast.success(
        market === "na"
          ? `Loaded ${unique.length} URLs from file`
          : `已从文件读取 ${unique.length} 个链接`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async () => {
    const urls = extractUrls(text);
    if (urls.length === 0) {
      toast.error(market === "na" ? "Add at least one RSS URL" : "请至少添加一个 RSS 链接");
      return;
    }
    setRunning(true);
    setDone(0);
    const init: Result[] = urls.map((u) => ({ url: u, status: "pending" }));
    setResults(init);

    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        await ingest({ data: { rssUrl: url, market } });
        okCount++;
        setResults((r) =>
          r.map((x, idx) => (idx === i ? { ...x, status: "ok" } : x)),
        );
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : "Failed";
        setResults((r) =>
          r.map((x, idx) => (idx === i ? { ...x, status: "fail", message: msg } : x)),
        );
      }
      setDone(i + 1);
    }
    setRunning(false);
    toast.success(
      market === "na"
        ? `Done: ${okCount} succeeded, ${failCount} failed`
        : `完成：成功 ${okCount}，失败 ${failCount}`,
    );
  };

  const total = results.length || extractUrls(text).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const t = (cn: string, en: string) => (market === "na" ? en : cn);

  return (
    <div className="space-y-3">
      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="paste">{t("批量粘贴", "Paste URLs")}</TabsTrigger>
          <TabsTrigger value="file">{t("上传 Excel/CSV", "Upload Excel/CSV")}</TabsTrigger>
        </TabsList>
        <TabsContent value="paste" className="mt-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              "每行一个 RSS 链接，或用空格/逗号分隔\nhttps://feeds.example.com/podcast1.xml\nhttps://feeds.example.com/podcast2.xml",
              "One RSS URL per line, or separated by spaces/commas",
            )}
            className="min-h-[140px] font-mono text-xs"
          />
        </TabsContent>
        <TabsContent value="file" className="mt-3">
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-3 text-sm text-muted-foreground">
              {t(
                "支持 .xlsx / .xls / .csv，自动提取所有含 RSS 链接的单元格",
                "Supports .xlsx / .xls / .csv — auto-extracts all cells containing RSS URLs",
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t("选择文件", "Choose file")}
            </Button>
            {text && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t(
                  `当前已加载 ${extractUrls(text).length} 个链接`,
                  `${extractUrls(text).length} URLs loaded`,
                )}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {t(
            `共 ${extractUrls(text).length} 个链接`,
            `${extractUrls(text).length} URLs ready`,
          )}
        </div>
        <Button
          onClick={run}
          disabled={running || extractUrls(text).length === 0}
          style={{ background: "var(--gradient-brand)" }}
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t(`导入中 ${done}/${total}`, `Importing ${done}/${total}`)}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {t("开始批量导入", "Start bulk import")}
            </>
          )}
        </Button>
      </div>

      {(running || results.length > 0) && (
        <div className="space-y-2">
          <Progress value={progress} />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
            {results.map((r, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {r.status === "ok" && (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--success)]" />
                )}
                {r.status === "fail" && (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                )}
                {r.status === "pending" && (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono">{r.url}</div>
                  {r.message && (
                    <div className="text-destructive">{r.message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
