import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Radio className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">PodMetrics</span>
          <span className="ml-1 text-xs text-muted-foreground">中文播客数据平台</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeOptions={{ exact: true }}
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            首页
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            Dashboard
          </Link>
          <Link
            to="/planner"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            投放规划师
          </Link>
        </nav>
      </div>
    </header>
  );
}
