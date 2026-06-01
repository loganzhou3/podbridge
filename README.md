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
AI_GATEWAY_API_KEY=
OPENAI_API_KEY=
AI_GATEWAY_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-5-mini
AI_STRATEGY_MODEL=gpt-5-mini
AI_PLANNER_MODEL=gpt-5-mini
```

`AI_GATEWAY_API_KEY` is preferred for OpenAI-compatible gateways. If it is not set, the app falls back to `OPENAI_API_KEY`. `AI_GATEWAY_URL` can point to OpenAI or any compatible chat completions proxy.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`, `AI_GATEWAY_API_KEY`, or `OPENAI_API_KEY` to the browser.

## Supabase

The Supabase project id is configured in `supabase/config.toml`.

Apply migrations with the Supabase CLI:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

The application uses the service role key for trusted server functions that ingest podcasts, update snapshots, and generate AI strategy data.

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
bunx wrangler secret put AI_GATEWAY_API_KEY
bunx wrangler secret put AI_GATEWAY_URL
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
- AI calls are configured through environment variables and should not depend on Lovable-specific gateway URLs or keys.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Public refresh endpoints under `/api/public/hooks/*` should be protected by a shared secret or platform access control before production use.
