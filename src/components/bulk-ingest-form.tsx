import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { ingestPodcast, searchPodcasts } from "@/lib/podcast.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Result = {
  input: string;
  resolved?: string;
  status: "pending" | "ok" | "fail";
  message?: string;
};

export function BulkIngestForm({ market = "cn" }: { market?: "cn" | "na" }) {
  const ingest = useServerFn(ingestPodcast);
  const search = useServerFn(searchPodcasts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(0);

  const isUrl = (s: string) => /^https?:\/\//i.test(s);

  // Split input into entries: each line is one entry; also allow comma/semicolon separators.
  // URLs are kept as-is; names are kept as a single trimmed phrase per line.
  const extractEntries = (raw: string): string[] => {
    const entries = raw
      .split(/[\n;]+/)
      .flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed) return [];
        // If a line is purely URLs, split by spaces/commas; otherwise treat the whole line as a name.
        const parts = trimmed.split(/[\s,]+/).filter(Boolean);
        if (parts.every(isUrl)) return parts;
        return [trimmed];
      })
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(entries));
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
            if (s) collected.push(s);
          }
        }
      }
      const unique = Array.from(new Set(collected));
      if (unique.length === 0) {
        toast.error(market === "na" ? "No entries found in file" : "文件中未找到内容");
        return;
      }
      setText((prev) => {
        const merged = Array.from(new Set([...extractEntries(prev), ...unique]));
        return merged.join("\n");
      });
      toast.success(
        market === "na"
          ? `Loaded ${unique.length} entries from file`
          : `已从文件读取 ${unique.length} 条`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async () => {
    const entries = extractEntries(text);
    if (entries.length === 0) {
      toast.error(market === "na" ? "Add at least one entry" : "请至少添加一条");
      return;
    }
    setRunning(true);
    setDone(0);
    const init: Result[] = entries.map((u) => ({ input: u, status: "pending" }));
    setResults(init);

    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        // Resolve name -> feedUrl via Apple search if not already a URL
        let rssUrl = entry;
        if (!isUrl(entry)) {
          const sr = await search({ data: { query: entry, market, limit: 1 } });
          if (!sr.ok || sr.results.length === 0) {
            failCount++;
            setResults((r) =>
              r.map((x, idx) =>
                idx === i
                  ? {
                      ...x,
                      status: "fail",
                      message:
                        market === "na" ? "No match found" : "未搜到匹配的播客",
                    }
                  : x,
              ),
            );
            setDone(i + 1);
            continue;
          }
          rssUrl = sr.results[0].feedUrl;
          setResults((r) =>
            r.map((x, idx) => (idx === i ? { ...x, resolved: rssUrl } : x)),
          );
        }

        const res = await ingest({ data: { rssUrl, market } });
        if (res.ok === false) {
          failCount++;
          setResults((r) =>
            r.map((x, idx) =>
              idx === i ? { ...x, status: "fail", message: res.error } : x,
            ),
          );
          setDone(i + 1);
          continue;
        }
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

  const total = results.length || extractEntries(text).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const t = (cn: string, en: string) => (market === "na" ? en : cn);

  return (
    <div className="space-y-3">
      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="paste">{t("批量粘贴", "Paste entries")}</TabsTrigger>
          <TabsTrigger value="file">{t("上传 Excel/CSV", "Upload Excel/CSV")}</TabsTrigger>
        </TabsList>
        <TabsContent value="paste" className="mt-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              "每行一个：可填播客名称或 RSS 链接\n日谈公园\n商业就是这样\nhttps://feeds.example.com/podcast.xml",
              "One per line: podcast name or RSS URL\nThe Daily\nhttps://feeds.example.com/podcast.xml",
            )}
            className="min-h-[140px] font-mono text-xs"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t(
              "名称将通过 Apple Podcasts 自动匹配最相似的播客",
              "Names are auto-matched via Apple Podcasts search",
            )}
          </p>
        </TabsContent>
        <TabsContent value="file" className="mt-3">
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-3 text-sm text-muted-foreground">
              {t(
                "支持 .xlsx / .xls / .csv，自动读取所有单元格（播客名或 RSS 链接）",
                "Supports .xlsx / .xls / .csv — reads every cell (name or RSS URL)",
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
                  `当前已加载 ${extractEntries(text).length} 条`,
                  `${extractEntries(text).length} entries loaded`,
                )}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {t(
            `共 ${extractEntries(text).length} 条`,
            `${extractEntries(text).length} entries ready`,
          )}
        </div>
        <Button
          onClick={run}
          disabled={running || extractEntries(text).length === 0}
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
                  <div className="truncate font-mono">{r.input}</div>
                  {r.resolved && r.resolved !== r.input && (
                    <div className="truncate text-[10px] text-muted-foreground">
                      → {r.resolved}
                    </div>
                  )}
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
