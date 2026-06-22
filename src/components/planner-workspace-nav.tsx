import { Link } from "@tanstack/react-router";
import { ClipboardList, LayoutDashboard, WandSparkles } from "lucide-react";

const ITEMS = [
  { to: "/planner", label: "快速生成", icon: WandSparkles },
  { to: "/briefs", label: "品牌建档", icon: ClipboardList },
  { to: "/campaigns", label: "投放项目", icon: LayoutDashboard },
] as const;

export function PlannerWorkspaceNav() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border/70 pb-4">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{
              className:
                "inline-flex items-center gap-2 rounded-md border border-primary bg-primary text-primary-foreground px-3 py-2 text-sm",
            }}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
