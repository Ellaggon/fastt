# Supabase Migration - Phase 7 Cutover

Date: 2026-07-22

## Objective

Deploy with Supabase staging, run smoke tests, briefly freeze writes, execute final Turso export, final Supabase import, validation, environment cutover, and monitor latency/errors.

## Status

Phase 7 is partially executed.

Completed locally:

- Pre-cutover Astro check.
- Pre-cutover Postgres smoke tests.
- Local production build.
- Final Turso export.
- Final transform to Postgres import format.
- Final Supabase staging import with `FASTT_SUPABASE_TRUNCATE=1`.
- Final Supabase validation: counts and checksums.
- Post-import Postgres smoke tests.
- Initial Supabase staging latency probe.

Blocked externally:

- Remote deploy to Vercel: `vercel` CLI is not installed in this workspace.
- Production/staging env var switch in Vercel: requires Vercel project access or dashboard action.
- Real write freeze: requires operational/user-facing freeze coordination outside the local repo.
- Remote app error monitoring: requires deployed URL/logging provider/Vercel access.

## Commands Executed

```bash
pnpm exec astro check
pnpm test:postgres
pnpm run build
pnpm exec tsx scripts/db/turso-to-supabase/export-turso.ts
pnpm exec tsx scripts/db/turso-to-supabase/transform-for-postgres.ts
FASTT_SUPABASE_TRUNCATE=1 pnpm exec tsx scripts/db/turso-to-supabase/load-supabase.ts
pnpm exec tsx scripts/db/turso-to-supabase/validate-supabase-load.ts
pnpm test:postgres
```

## Validation Results

Astro check:

```text
0 errors
0 warnings
142 hints
```

Local build:

```text
astro build --remote: passed
```

Final Supabase staging import:

```text
Tables loaded: 79
Rows loaded: 3,596
Non-empty tables: 43
```

Final Supabase staging validation:

```text
Tables validated: 79
Count validation: 79/79 passed
Checksum validation: 79/79 passed
Mismatches: 0
```

Post-import Postgres smoke:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

## Initial Latency Probe

Probe:

- 20 samples.
- Each sample executed 4 sequential count queries:
  - `SearchUnitView`
  - `EffectivePricingV2`
  - `DailyInventory`
  - `Booking`

Result:

```json
{
  "samples": 20,
  "probeQueriesPerSample": 4,
  "minMs": 384.3,
  "p50Ms": 431.1,
  "p95Ms": 655.4,
  "maxMs": 1224.9
}
```

Interpretation:

- This is a direct remote DB probe from the local machine, not an in-region serverless measurement.
- Production latency must be measured from the deployed app runtime after Vercel env cutover.

## Cutover Env Target

Runtime application envs should point to Supabase pooler:

```text
DATABASE_URL=<Supabase transaction pooler URI>
SUPABASE_DB_POOLER_URL=<same Supabase transaction pooler URI>
```

Migration/admin env should point to direct connection:

```text
DIRECT_URL=<Supabase direct connection URI>
```

Auth envs:

```text
SUPABASE_URL=<project URL>
SUPABASE_ANON_KEY=<publishable/anon key>
```

Legacy Turso envs should not be used by runtime after cutover:

```text
ASTRO_DB_REMOTE_URL
ASTRO_DB_APP_TOKEN
```

Keep them available only for rollback/export until the rollback window closes.

## Required Manual/External Steps

1. Announce a brief write freeze.
2. Confirm no admins/providers are editing inventory, pricing, catalog, policies or bookings.
3. Set Vercel preview/staging envs to Supabase values.
4. Deploy preview/staging.
5. Run endpoint smoke from deployed URL:
   - catalog/product read
   - search availability
   - pricing read model
   - inventory calendar
   - booking hold/confirm on a disposable fixture
   - provider auth/session sync
6. If preview is healthy, set production envs to Supabase values.
7. Deploy production.
8. Monitor:
   - 5xx rate
   - auth failures
   - booking confirm errors
   - inventory hold errors
   - search latency p95/p99
   - Postgres connection pool saturation
9. Keep Turso credentials for rollback until the observation window closes.

## Rollback Trigger

Rollback if any of these occur after production env switch:

- Sustained 5xx errors on booking/search/provider dashboard.
- Booking confirmations fail or double-book.
- Search/pricing read models return empty or stale data unexpectedly.
- Postgres pooler connection errors persist beyond transient deploy warmup.
- Auth session sync creates inconsistent `User`/`ProviderUser` mappings.

Rollback path:

1. Revert Vercel runtime envs to Turso/Astro DB values.
2. Redeploy the previous known-good build.
3. Keep Supabase staging frozen for forensic comparison.
4. Re-run final validation and inspect mismatch/error logs before retrying cutover.
