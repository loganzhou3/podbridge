# PodBridge

PodBridge is a TanStack Start application for podcast ingestion, podcast analytics, and AI-assisted advertising planning.

## Tech Stack

- Runtime and package manager: Bun
- App framework: React, Vite, TanStack Router, TanStack Start
- Data: Supabase Postgres
- Deployment target: Cloudflare Workers
- UI: Tailwind CSS, shadcn/ui, Radix UI, Recharts

## Local Setup

Install Bun if it is not already available:

```sh
curl -fsSL https://bun.sh/install | bash
```

Install dependencies:

```sh
bun install
```

Create a local `.env` file. Do not commit it.

```sh
cp .env.example .env
```

If `.env.example` is not present in your checkout, create `.env` with the variables listed below.

Start the app locally:

```sh
bun run dev
```

Build the app:

```sh
bun run build
```

## Environment Variables

Client-exposed Supabase variables:

```sh
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Server-side Supabase variables:

```sh
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

External API variables:

```sh
FIRECRAWL_API_KEY=
LISTEN_NOTES_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1/responses
AI_MODEL=gpt-5-mini
AI_STRATEGY_MODEL=gpt-5-mini
AI_PLANNER_MODEL=gpt-5-mini

# Optional OpenAI-compatible chat-completions gateway fallback:
# AI_GATEWAY_API_KEY=
# AI_GATEWAY_URL=https://api.openai.com/v1/chat/completions
```

`LISTEN_NOTES_API_KEY` powers podcast inventory discovery for daily refresh jobs. `FIRECRAWL_API_KEY` is reserved for brand/contact web lookup, not podcast inventory discovery.

`OPENAI_API_KEY` is the primary key for the AI planner and strategy features. By default the app calls OpenAI's Responses API at `OPENAI_BASE_URL`. If you need an OpenAI-compatible chat-completions proxy, set `AI_GATEWAY_URL` and `AI_GATEWAY_API_KEY`; URLs containing `/chat/completions` use the legacy chat-completions payload automatically.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`, `LISTEN_NOTES_API_KEY`, `AI_GATEWAY_API_KEY`, or `OPENAI_API_KEY` to the browser.

## Supabase

The Supabase project id is configured in `supabase/config.toml`.

Apply migrations with the Supabase CLI:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

The application uses the service role key for trusted server functions that ingest podcasts, update snapshots, and generate AI strategy data.

## Research Capture

Marketplace data should not be mocked. Use `/research` as the Research Capture workspace for manual or browser-assisted collection of public podcast information from Ximalaya, Xiaoyuzhou, Apple Podcasts, Spotify, or other visible public pages.

The workflow is:

1. Create a research task with platform, keyword, target category, notes, and status.
2. Open the generated external search link in a new window.
3. Manually review public platform pages without bypassing login, CAPTCHA, paywalls, or platform limits.
4. Paste visible podcast information into the capture form.
5. Save the record to create a new podcast or link it to an existing podcast.
6. Review the source evidence on the podcast detail page.

Every capture record must include:

- `sourceUrl`
- `capturedAt`
- `capturedBy`
- `captureMethod`
- `confidence`
- `evidenceNote`

The Research Capture tables are:

- `research_tasks`
- `research_capture_records`
- `podcast_source_evidence`

AI helper fields generated from a capture record are explicitly marked as inference. They are not platform-official data and should be manually confirmed before sales use.

## Creator Claim And Sponsor Intelligence

The marketplace bridge currently includes two frontend-first modules:

- `/creator-claim/:podcastId`: creators, producers, business managers, and agencies can submit a podcast claim with contact details, collaboration preferences, and rate ranges.
- `/claims`: review submitted claims and mark them as `verified`, `rejected`, or `needs_more_info`. Only verified claims appear as creator-authorized information on podcast detail pages.
- `/sponsors`: manually record public or confirmed podcast sponsorship observations, filter the intelligence library, and inspect source evidence and confidence.

Claims and sponsorship observations are persisted in Supabase through `src/lib/marketplace.storage.ts`. No sample sponsorships or claims are seeded. Empty screens remain empty until a user submits sourced information.

Source handling rules:

- Every sponsorship record includes a source type, source label, optional source URL, timestamp, and confidence score.
- Creator information is not shown as authorized until its claim is marked `verified`.
- AI analysis is always labeled as inference and is never presented as official platform, brand, or creator data.
- Low-confidence information displays an explicit reference-only warning.

RLS limits claim review and sponsorship verification to administrators. Researcher and administrator roles can submit sponsorship intelligence; verified records are publicly readable.

## Campaign Workspace V1

Campaign Workspace turns a brand brief and podcast shortlist into an executable project workflow:

- `/campaigns`: create, edit, delete, and review Campaign status and summary metrics.
- `/campaigns/:campaignId`: manage the brief, shortlist, contact pipeline, quotes, negotiated prices, notes, next actions, and follow-up dates.
- Podcast detail and AI Planner recommendations can be added directly to an existing Campaign.
- The shortlist selector reads the existing PodBridge podcast inventory; it does not call a new platform API.
- Outreach assets include Chinese email, English email, WeChat copy, and a short creator invitation. They are generated as drafts and never sent automatically.
- Final plans include budget allocation, recommendation reasons, Brand Safety notes, KPI estimates, evidence, confidence, and next actions.
- Markdown export is available. PDF export is intentionally disabled and labeled as forthcoming.

Campaign Workspace uses the typed models in `src/lib/campaign-workspace.types.ts` and the Supabase adapter in `src/lib/campaign-workspace.storage.ts`. It does not seed fake Campaigns or sponsorship records. Every AI-derived match score, safety score, recommendation, message, and final plan is explicitly labeled as AI-generated guidance.

Campaign records and shortlist items synchronize through Supabase. Generated outreach and final-plan drafts remain browser-local until a generated-assets table is introduced.

## Supabase Auth And Backend V1

Authentication routes:

- `/login`: email and password login.
- `/signup`: email registration; new users receive the `brand_user` role.
- `/settings`: profile, company, website, role, email, and logout.

Apply the backend migration before testing authenticated writes:

```sh
bunx supabase login
bunx supabase link --project-ref YOUR_PROJECT_REF
bunx supabase db push
```

The migration `supabase/migrations/20260621093000_supabase_auth_backend_v1.sql` creates or extends profiles, campaigns, shortlist items, creator claims, sponsorship intelligence, evidence, and audit logs. It also removes legacy anonymous podcast and Campaign write policies and installs role-aware RLS.

Required browser environment variables:

```sh
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Server-side jobs may additionally use `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service-role key through a `VITE_` variable.

Role behavior:

- `brand_user`: manages only owned Campaigns.
- `creator`: submits and views own Creator Claims.
- `researcher`: submits Sponsor Intelligence and Evidence for review.
- `admin`: reviews claims and sponsorship records, manages evidence, and can read audit logs.

To bootstrap the first administrator, update the matching `profiles.role` value to `admin` in the Supabase SQL editor after that user registers.

## Cloudflare Deployment

Cloudflare Workers is the primary deployment target for this repository.

1. Install dependencies:

```sh
bun install
```

2. Build:

```sh
bun run build
```

3. Configure Cloudflare secrets:

```sh
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put FIRECRAWL_API_KEY
bunx wrangler secret put LISTEN_NOTES_API_KEY
bunx wrangler secret put OPENAI_API_KEY
bunx wrangler secret put OPENAI_BASE_URL
bunx wrangler secret put AI_MODEL
bunx wrangler secret put AI_STRATEGY_MODEL
bunx wrangler secret put AI_PLANNER_MODEL
```

4. Deploy:

```sh
bunx wrangler deploy
```

The Worker config lives in `wrangler.jsonc`.

## Vercel Deployment

This codebase currently carries Cloudflare-oriented Vite and Worker configuration. For a Vercel deployment:

1. Import the GitHub repository into Vercel.
2. Select Bun as the package manager.
3. Use `bun install` for install and `bun run build` for build.
4. Add the same environment variables listed above in Vercel Project Settings.
5. Verify the TanStack Start server output with Vercel before production traffic. If the build still targets Cloudflare Workers, replace the Cloudflare-specific Vite/Wrangler configuration with a Vercel-compatible TanStack Start deployment preset.

Cloudflare should be treated as the known-good target until the Vercel adapter/configuration is explicitly validated.

## Migration Notes

- `.env` and local environment files are intentionally ignored.
- AI calls use OpenAI API environment variables by default and do not depend on Lovable-specific gateway URLs or keys.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Public refresh endpoints under `/api/public/hooks/*` should be protected by a shared secret or platform access control before production use.
