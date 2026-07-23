# Performance Observability Contract

Fastt treats performance as a production contract, not as a local-only benchmark.

## Response Headers

- `Server-Timing`: per-segment server timings for critical SSR/API work.
- `X-Fastt-Cache`: request cache outcome. Values: `hit`, `miss`, `stale`, or `none`.
- `X-Fastt-Cache-Detail`: aggregate cache counters for the request.
- `X-Fastt-Region`: runtime region from `FASTT_REGION`, `VERCEL_REGION`, provider env, or `local`.

## Structured Logs

Route performance logs use JSON and hash sensitive identifiers:

- `userHash`
- `providerHash`
- `productHash`

Do not log raw emails, user IDs, provider IDs, product IDs, tokens, cookies, or full query strings.

## Browser RUM

The base layout reports:

- TTFB
- LCP
- INP
- Astro route transition duration

Events are sent to `/api/internal/observability/rum` with `sendBeacon` when possible.

## Public Lab Measurements

Run PageSpeed against preview and production URLs:

```bash
FASTT_PERF_URLS="https://preview.example.com/provider/settings,https://fastt.example.com/provider/settings" pnpm run perf:pagespeed
```

Use production URLs for release decisions. Local dev is useful for diagnosis, but not for p75/p95.

## Infrastructure Region Contract

Fastt keeps SSR close to Supabase Postgres. The current primary target is:

- Supabase Postgres: `sa-east-1` / São Paulo.
- Vercel Functions: `gru1`, configured in `vercel.json`.
- Runtime Postgres connection: Supabase transaction pooler through `SUPABASE_DB_POOLER_URL` or `DATABASE_URL`.
- Direct Postgres connection: `DIRECT_URL`, reserved for migrations, imports, exports, validation scripts, and admin one-off jobs.
- Redis/Upstash: choose the region closest to the Vercel function region. For `gru1`, prefer Upstash/AWS `sa-east-1`. If the deployment must fall back to `iad1`, prefer `us-east-1`.

Vercel defaults serverless functions to `iad1` unless a region is configured. `gru1` is the closest compute region to a São Paulo Supabase database. Miami is useful as a network point of reference, but it is not currently a Vercel compute region in the public region list; if the current Vercel plan cannot deploy to `gru1`, compare real measurements between the available Vercel fallback, typically `iad1`, and the database before changing the database region.

### Confirm Runtime Region

Deploy with `FASTT_INFRA_HEALTH_TOKEN` and run:

```bash
FASTT_INFRA_URLS="https://preview.example.com,https://fastt.example.com" \
FASTT_INFRA_HEALTH_TOKEN="..." \
pnpm run perf:infra-region
```

The script calls `/api/internal/observability/infra-region` and reports:

- `region`: actual Vercel/function region from `X-Fastt-Region`.
- `dbMs`: runtime Postgres round-trip.
- `redisMs`: cache round-trip.
- `runtimeUsesPooler`: must be `true` in serverless deployments.
- `cacheConfigured`: confirms Redis/Upstash is active instead of only memory fallback.

### Fallback Comparison

If `gru1` is unavailable, deploy one preview with the closest allowed region and compare against the São Paulo database:

```bash
FASTT_INFRA_URLS="https://preview-gru.example.com,https://preview-iad.example.com" \
FASTT_INFRA_HEALTH_TOKEN="..." \
FASTT_INFRA_ATTEMPTS=10 \
pnpm run perf:infra-region
```

Decision rule:

- Keep the function region closest to Postgres when `dbMs` is materially lower and p95 SSR improves.
- Keep Redis near the function region, because cache calls happen inside SSR/API runtime.
- Do not use `DIRECT_URL` for app runtime; it is only for controlled scripts.
