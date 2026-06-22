import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-md px-6 py-16">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-bold">创建账号</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            新账号默认角色为品牌用户，管理员可在 Supabase 中调整角色。
          </p>
          {submitted ? (
            <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              注册成功。请检查邮箱并完成验证，然后返回登录。
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaving(true);
                const form = new FormData(event.currentTarget);
                const { data, error } = await supabase.auth.signUp({
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                  options: {
                    data: {
                      full_name: String(form.get("fullName")),
                      company_name: String(form.get("companyName")),
                    },
                  },
                });
                setSaving(false);
                if (error) return toast.error(error.message);
                setSubmitted(true);
                toast.success(data.session ? "注册并登录成功" : "注册成功，请验证邮箱");
              }}
            >
              <label className="block space-y-1">
                <span className="text-xs font-medium">姓名</span>
                <Input name="fullName" required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">公司</span>
                <Input name="companyName" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">邮箱</span>
                <Input name="email" type="email" autoComplete="email" required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">密码</span>
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <Button className="w-full" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {saving ? "提交中" : "注册"}
              </Button>
            </form>
          )}
          <p className="mt-5 text-center text-sm text-muted-foreground">
            已有账号？
            <Link
              to="/login"
              search={{ next: "/campaigns" }}
              className="ml-1 text-primary hover:underline"
            >
              登录
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
