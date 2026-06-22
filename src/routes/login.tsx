import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, LogIn } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : "/campaigns",
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [saving, setSaving] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-md px-6 py-16">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-bold">登录 PodBridge</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            登录后可以管理 Campaign、主播认领和投放情报。
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              const form = new FormData(event.currentTarget);
              const { error } = await supabase.auth.signInWithPassword({
                email: String(form.get("email")),
                password: String(form.get("password")),
              });
              setSaving(false);
              if (error) return toast.error(error.message);
              toast.success("登录成功");
              await navigate({ href: next });
            }}
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium">邮箱</span>
              <Input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">密码</span>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
              />
            </label>
            <Button className="w-full" disabled={saving}>
              {saving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {saving ? "登录中" : "登录"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            还没有账号？
            <Link to="/signup" className="ml-1 text-primary hover:underline">
              注册
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
