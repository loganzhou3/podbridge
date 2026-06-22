import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({ component: SettingsPage });
const ROLE_LABELS = {
  admin: "管理员",
  brand_user: "品牌用户",
  creator: "播客主",
  researcher: "研究员",
} as const;

function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login", search: { next: "/settings" } });
  }, [loading, user, navigate]);
  if (loading || !user)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
        正在读取账号…
      </div>
    );
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold">用户设置</h1>
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              const form = new FormData(event.currentTarget);
              const client = supabase as any;
              const { error } = await client
                .from("profiles")
                .update({
                  full_name: String(form.get("fullName")),
                  company_name: String(form.get("companyName")),
                  website: String(form.get("website")) || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", user.id);
              setSaving(false);
              if (error) return toast.error(error.message);
              await refreshProfile();
              toast.success("设置已保存");
            }}
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium">用户名</span>
              <Input name="fullName" defaultValue={profile?.full_name ?? ""} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">公司</span>
              <Input name="companyName" defaultValue={profile?.company_name ?? ""} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">网站</span>
              <Input name="website" type="url" defaultValue={profile?.website ?? ""} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">邮箱</span>
              <Input value={user.email ?? ""} readOnly />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">角色</span>
              <Input value={ROLE_LABELS[profile?.role ?? "brand_user"]} readOnly />
            </label>
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await signOut();
                  toast.success("已登出");
                  await navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4" />
                登出
              </Button>
              <Button disabled={saving}>
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存设置
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
