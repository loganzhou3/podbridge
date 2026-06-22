import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPodcastDetail } from "@/lib/podcast.functions";
import { createLocalId, saveCreatorClaim } from "@/lib/marketplace.storage";
import type { CreatorClaimRequest } from "@/lib/marketplace.types";
import { loginHref, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/creator-claim/$podcastId")({
  component: CreatorClaimPage,
});

const FORMATS = [
  "口播广告",
  "节目冠名",
  "主播访谈",
  "联名内容",
  "社群推广",
  "Newsletter",
  "短视频切片",
  "线下活动",
];
const PREFERRED_INDUSTRIES = [
  "AI / SaaS",
  "消费电子",
  "教育",
  "新消费",
  "金融",
  "生活方式",
  "母婴",
  "运动健康",
  "游戏",
  "其他",
];
const BLOCKED_INDUSTRIES = [
  "金融高风险",
  "医疗健康",
  "成人内容",
  "博彩",
  "烟酒",
  "政治相关",
  "其他",
];

function checkedValues(form: FormData, name: string) {
  return form.getAll(name).map(String);
}

function OptionGrid({ name, options }: { name: string; options: string[] }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {options.map((option) => (
        <label
          key={option}
          className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
        >
          <input type="checkbox" name={name} value={option} className="h-4 w-4 accent-primary" />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function CreatorClaimPage() {
  const { user } = useAuth();
  const { podcastId } = Route.useParams();
  const detail = useServerFn(getPodcastDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["claim-podcast", podcastId],
    queryFn: () => detail({ data: { id: podcastId } }),
  });
  const [submitted, setSubmitted] = useState<CreatorClaimRequest | null>(null);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        正在读取播客信息…
      </div>
    );
  }

  const podcastName = data?.podcast.title ?? "未命名播客";

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-semibold">认领申请已提交</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              PodBridge 会在人工确认后更新该播客的商务信息。当前信息不会立即公开展示。
            </p>
            <div
              id="submission"
              className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-left text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{submitted.podcastName}</span>
                <Badge variant="secondary">待审核</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                认领人：{submitted.claimantName} · 来源：主播提交 · 提交时间：
                {new Date(submitted.submittedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/podcast/$id" params={{ id: podcastId }}>
                  返回播客详情
                </Link>
              </Button>
              <Button
                onClick={() =>
                  document.querySelector("#submission")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                查看我的提交信息
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link
          to="/podcast/$id"
          params={{ id: podcastId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回播客详情
        </Link>
        <div className="mt-6 flex items-start gap-3">
          <ShieldCheck className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">认领你的播客</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              如果你是该节目的主播、制作人或商务负责人，可以提交认领申请。通过后，PodBridge
              将展示你的授权商务信息，帮助品牌方更准确地与你建立合作。
            </p>
          </div>
        </div>

        <form
          className="mt-8 space-y-8"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!user) {
              window.location.href = loginHref(`/creator-claim/${podcastId}`);
              return;
            }
            const form = new FormData(event.currentTarget);
            const now = new Date().toISOString();
            const claim: CreatorClaimRequest = {
              id: createLocalId("claim"),
              podcastId,
              podcastName,
              claimantName: String(form.get("claimantName") ?? "").trim(),
              role: String(form.get("role") ?? "other") as CreatorClaimRequest["role"],
              contactEmail: String(form.get("contactEmail") ?? "").trim(),
              phoneOrWechat: String(form.get("phoneOrWechat") ?? "").trim() || undefined,
              linkedinOrWebsite: String(form.get("linkedinOrWebsite") ?? "").trim() || undefined,
              officialPodcastUrl: String(form.get("officialPodcastUrl") ?? "").trim() || undefined,
              proofDescription: String(form.get("proofDescription") ?? "").trim() || undefined,
              proofFileUrl: undefined,
              acceptsSponsorship: form.get("acceptsSponsorship") === "yes",
              availableFormats: checkedValues(form, "availableFormats"),
              preferredIndustries: checkedValues(form, "preferredIndustries"),
              blockedIndustries: checkedValues(form, "blockedIndustries"),
              hostReadPriceRange: String(form.get("hostReadPriceRange") ?? "").trim() || undefined,
              sponsorshipPriceRange:
                String(form.get("sponsorshipPriceRange") ?? "").trim() || undefined,
              interviewPriceRange:
                String(form.get("interviewPriceRange") ?? "").trim() || undefined,
              packagePriceRange: String(form.get("packagePriceRange") ?? "").trim() || undefined,
              priceNote: String(form.get("priceNote") ?? "").trim() || undefined,
              currency: String(form.get("currency") ?? "CNY") as CreatorClaimRequest["currency"],
              audienceDescription:
                String(form.get("audienceDescription") ?? "").trim() || undefined,
              previousSponsors: String(form.get("previousSponsors") ?? "").trim() || undefined,
              caseStudyUrl: String(form.get("caseStudyUrl") ?? "").trim() || undefined,
              additionalNote: String(form.get("additionalNote") ?? "").trim() || undefined,
              status: "pending",
              sourceType: "creator_submitted",
              submittedAt: now,
              updatedAt: now,
            };
            try {
              const saved = await saveCreatorClaim(claim);
              setSubmitted(saved);
              toast.success("认领申请已提交审核");
              window.scrollTo({ top: 0, behavior: "smooth" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "认领申请提交失败");
            }
          }}
        >
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-semibold">基础信息</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="播客名称">
                <Input value={podcastName} readOnly />
              </Field>
              <Field label="认领人姓名 *">
                <Input name="claimantName" required />
              </Field>
              <Field label="身份 *">
                <select
                  name="role"
                  required
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="host">主播</option>
                  <option value="producer">制作人</option>
                  <option value="business_manager">商务负责人</option>
                  <option value="agency">MCN / Agency</option>
                  <option value="other">其他</option>
                </select>
              </Field>
              <Field label="联系邮箱 *">
                <Input name="contactEmail" type="email" required />
              </Field>
              <Field label="手机号 / 微信（可选）">
                <Input name="phoneOrWechat" />
              </Field>
              <Field label="LinkedIn / 官网（可选）">
                <Input name="linkedinOrWebsite" type="url" />
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-semibold">验证信息</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="节目官方链接">
                <Input
                  name="officialPodcastUrl"
                  type="url"
                  defaultValue={
                    data?.podcast.xiaoyuzhou_url ??
                    data?.podcast.ximalaya_url ??
                    data?.podcast.itunes_url ??
                    ""
                  }
                />
              </Field>
              <Field label="证明文件链接（预留）">
                <Input disabled placeholder="暂不支持文件上传" />
              </Field>
              <div className="md:col-span-2">
                <Field label="身份说明">
                  <Textarea
                    name="proofDescription"
                    rows={3}
                    placeholder="例如：我是该节目的主播，可通过 shownotes 邮箱验证"
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-semibold">商务合作偏好</h2>
            <div className="mt-4">
              <div className="text-xs font-medium text-muted-foreground">是否接受品牌合作</div>
              <div className="mt-2 flex gap-4 text-sm">
                <label>
                  <input
                    type="radio"
                    name="acceptsSponsorship"
                    value="yes"
                    defaultChecked
                    className="mr-2 accent-primary"
                  />
                  接受
                </label>
                <label>
                  <input
                    type="radio"
                    name="acceptsSponsorship"
                    value="no"
                    className="mr-2 accent-primary"
                  />
                  暂不接受
                </label>
              </div>
            </div>
            <div className="mt-5 text-xs font-medium text-muted-foreground">可合作形式</div>
            <OptionGrid name="availableFormats" options={FORMATS} />
            <div className="mt-5 text-xs font-medium text-muted-foreground">偏好合作行业</div>
            <OptionGrid name="preferredIndustries" options={PREFERRED_INDUSTRIES} />
            <div className="mt-5 text-xs font-medium text-muted-foreground">不接受行业</div>
            <OptionGrid name="blockedIndustries" options={BLOCKED_INDUSTRIES} />
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">报价信息</h2>
              <Badge variant="outline">主播提交，审核后展示</Badge>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="货币">
                <select
                  name="currency"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option>CNY</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </Field>
              <Field label="口播报价区间">
                <Input name="hostReadPriceRange" placeholder="例如：8000-12000" />
              </Field>
              <Field label="冠名报价区间">
                <Input name="sponsorshipPriceRange" placeholder="例如：20000-30000" />
              </Field>
              <Field label="访谈报价区间">
                <Input name="interviewPriceRange" />
              </Field>
              <Field label="套餐报价区间">
                <Input name="packagePriceRange" />
              </Field>
              <Field label="报价备注">
                <Input name="priceNote" placeholder="档期、税费、制作费等" />
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-semibold">补充信息</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="听众画像描述">
                <Textarea name="audienceDescription" rows={3} />
              </Field>
              <Field label="历史合作品牌">
                <Textarea name="previousSponsors" rows={3} />
              </Field>
              <Field label="合作案例链接">
                <Input name="caseStudyUrl" type="url" />
              </Field>
              <Field label="补充说明">
                <Input name="additionalNote" />
              </Field>
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit">提交认领申请</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
