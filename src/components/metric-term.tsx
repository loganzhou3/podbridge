import { NotebookTabs } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TERM_NOTES: Record<string, string> = {
  CPM: "Cost Per Mille，每千次曝光成本。播客投放里常用来估算单集广告触达成本。",
  CPA: "Cost Per Action，每次有效行动成本。行动可以是注册、下单、留资或下载。",
  ROI: "Return on Investment，投资回报率。用于衡量投放带来的收益与成本之间的关系。",
  ACOS: "Advertising Cost of Sales，广告销售成本占比。常用于电商投放，数值越低通常越高效。",
  CTR: "Click Through Rate，点击率。表示看到内容后产生点击的人群比例。",
};

export function MetricTerm({ term }: { term: keyof typeof TERM_NOTES | string }) {
  const note = TERM_NOTES[term] ?? "关键投放指标，悬停查看中文解释。";

  return (
    <span className="inline-flex items-center gap-1">
      <span>{term}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${term} 指标解释`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <NotebookTabs className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 leading-relaxed">{note}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
