import { useMemo, useState } from "react";
import { CalendarIcon, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  date: Date;
  name: string;
  type: "holiday" | "commerce";
  region: string;
};

type BriefDatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showLabel?: boolean;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function fixedDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const date = new Date(year, month - 1, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const date = new Date(year, month, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function buildEvents(year: number): CalendarEvent[] {
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  const blackFriday = new Date(thanksgiving);
  blackFriday.setDate(thanksgiving.getDate() + 1);
  const cyberMonday = new Date(thanksgiving);
  cyberMonday.setDate(thanksgiving.getDate() + 4);

  return [
    { date: fixedDate(year, 1, 1), name: "New Year", type: "holiday", region: "全球" },
    { date: fixedDate(year, 2, 14), name: "Valentine's Day", type: "holiday", region: "全球" },
    { date: fixedDate(year, 3, 8), name: "International Women's Day", type: "holiday", region: "全球" },
    { date: fixedDate(year, 4, 22), name: "Earth Day", type: "holiday", region: "全球" },
    { date: fixedDate(year, 5, 1), name: "Labor Day / May Day", type: "holiday", region: "全球" },
    { date: nthWeekdayOfMonth(year, 5, 0, 2), name: "Mother's Day", type: "holiday", region: "全球" },
    { date: nthWeekdayOfMonth(year, 6, 0, 3), name: "Father's Day", type: "holiday", region: "全球" },
    { date: fixedDate(year, 10, 31), name: "Halloween", type: "holiday", region: "欧美" },
    { date: thanksgiving, name: "Thanksgiving", type: "holiday", region: "美国" },
    { date: fixedDate(year, 12, 24), name: "Christmas Eve", type: "holiday", region: "全球" },
    { date: fixedDate(year, 12, 25), name: "Christmas", type: "holiday", region: "全球" },
    { date: fixedDate(year, 12, 31), name: "New Year's Eve", type: "holiday", region: "全球" },
    { date: fixedDate(year, 1, 15), name: "年货节", type: "commerce", region: "中国" },
    { date: fixedDate(year, 3, 8), name: "38 大促", type: "commerce", region: "中国" },
    { date: fixedDate(year, 5, 20), name: "520 礼赠节点", type: "commerce", region: "中国" },
    { date: fixedDate(year, 6, 18), name: "618 年中大促", type: "commerce", region: "中国" },
    { date: fixedDate(year, 7, 15), name: "Prime Day 档期", type: "commerce", region: "全球电商" },
    { date: fixedDate(year, 9, 9), name: "99 大促", type: "commerce", region: "中国" },
    { date: fixedDate(year, 10, 10), name: "双 11 预热", type: "commerce", region: "中国" },
    { date: fixedDate(year, 11, 11), name: "Double 11", type: "commerce", region: "中国/全球" },
    { date: blackFriday, name: "Black Friday", type: "commerce", region: "全球电商" },
    { date: cyberMonday, name: "Cyber Monday", type: "commerce", region: "全球电商" },
    { date: fixedDate(year, 12, 12), name: "Double 12", type: "commerce", region: "中国" },
    { date: lastWeekdayOfMonth(year, 12, 1), name: "年末促销周", type: "commerce", region: "全球电商" },
  ];
}

function eventsForYears(year: number) {
  return [year - 1, year, year + 1, year + 2].flatMap(buildEvents);
}

function formatLabel(value: string) {
  const date = fromDateKey(value);
  if (!date) return "选择日期";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function BriefDatePicker({ label, value, onChange, showLabel = true }: BriefDatePickerProps) {
  const selected = fromDateKey(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected ?? new Date());
  const events = useMemo(() => eventsForYears(month.getFullYear()), [month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = toDateKey(event.date);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const holidayDates = events.filter((event) => event.type === "holiday").map((event) => event.date);
  const commerceDates = events.filter((event) => event.type === "commerce").map((event) => event.date);
  const monthEvents = events
    .filter(
      (event) =>
        event.date.getFullYear() === month.getFullYear() &&
        event.date.getMonth() === month.getMonth(),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
      {showLabel && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "min-w-0 w-full justify-start gap-2 px-3 text-left font-normal",
              showLabel && "mt-1",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{formatLabel(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[360px] p-0">
          <Calendar
            mode="single"
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => {
              if (!date) return;
              onChange(toDateKey(date));
              setMonth(date);
              setOpen(false);
            }}
            captionLayout="dropdown"
            modifiers={{ holiday: holidayDates, commerce: commerceDates }}
            modifiersClassNames={{
              holiday:
                "after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-emerald-500",
              commerce:
                "before:absolute before:right-1 before:top-1 before:h-1.5 before:w-1.5 before:rounded-full before:bg-amber-500",
            }}
          />
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                节假日
              </span>
              <span className="inline-flex items-center gap-1">
                <ShoppingBag className="h-3 w-3 text-amber-600" />
                电商节点
              </span>
            </div>
            <div className="max-h-28 space-y-1 overflow-auto pr-1">
              {monthEvents.map((event) => (
                <button
                  key={`${toDateKey(event.date)}-${event.name}`}
                  type="button"
                  onClick={() => {
                    onChange(toDateKey(event.date));
                    setMonth(event.date);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  <span className="font-medium">{event.name}</span>
                  <span className="text-muted-foreground">
                    {event.date.getMonth() + 1}/{event.date.getDate()} · {event.region}
                  </span>
                </button>
              ))}
              {!monthEvents.length && (
                <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  当前月份暂无重点节点
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
