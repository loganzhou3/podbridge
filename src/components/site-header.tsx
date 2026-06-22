import { Link, useLocation } from "@tanstack/react-router";
import { Radio, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isPlannerWorkspace =
    ["/planner", "/briefs", "/campaigns"].includes(location.pathname) ||
    location.pathname.startsWith("/campaigns/");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Radio className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">PodBridge</span>
          <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
            播客数据 · 中文/海外
          </span>
        </Link>
        <nav className="-mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm [&>a]:shrink-0 md:mx-0 md:w-auto md:pb-0">
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
            播客库
          </Link>
          <Link
            to="/research"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            数据采集
          </Link>
          <Link
            to="/claims"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            主播认领管理
          </Link>
          <Link
            to="/sponsors"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            品牌投放情报
          </Link>
          <Link
            to="/planner"
            className={
              isPlannerWorkspace
                ? "rounded-md bg-muted px-3 py-2 text-foreground"
                : "rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            投放规划师
          </Link>
          <Link
            to="/global"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            🌎 出海库
          </Link>
          <Link
            to="/global/planner"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 text-foreground bg-muted" }}
          >
            出海规划师
          </Link>
          {!loading && (
            <Link
              to={user ? "/settings" : "/login"}
              search={user ? undefined : { next: location.pathname }}
              aria-label={user ? "用户设置" : "登录"}
              title={user ? "用户设置" : "登录"}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <UserRound className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
