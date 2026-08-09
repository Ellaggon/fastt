# Tours canary rollout

Progressive release for Tours kill-switches. Commerce and check-in expand only after
observation proves no regression on hold failures, hold→confirm conversion, voucher
redeem/issued, or refund quote vs applied.

## Sequence

| Step | `TOURS_ROLLOUT_STAGE` | Who is on |
| ---- | --------------------- | --------- |
| 0 · Off | unset / typo / `off` | Nobody (**fail-closed**) |
| 1 · Staging | `staging` | Preview/staging deploy or hosts in `TOURS_ROLLOUT_STAGING_HOSTS` |
| 2 · Allowlist | `allowlist` | Providers in `TOURS_PROVIDER_ALLOWLIST` (checkout/check-in/refund-hours). Search stays on but **cards are filtered** to allowlisted providers. |
| 3 · Percentage | `percentage` | Allowlist ∪ stable hash bucket `< TOURS_ROLLOUT_PERCENT` (0–100). Search buckets by **session cookie**, not destination. |
| 4 · General | `general` | Everyone |

Kill-switches (still required, env-only, guest cannot override):

- `TOURS_CHECKOUT_ENABLED`
- `TOURS_CHECKIN_ENABLED`
- `TOURS_PUBLIC_SEARCH_ENABLED`
- `TOURS_REFUND_HOURS_ENABLED`

## Env knobs

```bash
TOURS_CHECKOUT_ENABLED=true
TOURS_CHECKIN_ENABLED=true
TOURS_PUBLIC_SEARCH_ENABLED=true
TOURS_REFUND_HOURS_ENABLED=true

TOURS_ROLLOUT_STAGE=staging          # staging | allowlist | percentage | general | off
TOURS_PROVIDER_ALLOWLIST=prov_a,prov_b
TOURS_ROLLOUT_PERCENT=10             # used when stage=percentage
TOURS_ROLLOUT_STAGING_HOSTS=localhost,staging.example.com
# Optional override when VERCEL_ENV is wrong in a given shell:
# TOURS_ROLLOUT_DEPLOYMENT_ENV=staging
# Dwell window before expand=true (default 24h):
# TOURS_ROLLOUT_MIN_DWELL_MS=86400000
# Optional pinned stage-entered timestamp:
# TOURS_ROLLOUT_STAGE_ENTERED_AT=2026-08-01T00:00:00.000Z

FASTT_INFRA_HEALTH_TOKEN=...         # required for /api/internal/observability/*
```

## Observation window (before each expand)

1. Open `/admin/tours/rollout` (session admin) or `GET /api/internal/observability/tours-rollout` with bearer token.
2. Confirm `canary.expansion.expand === true` **and** `health.status === "healthy"`.
3. `insufficient_sample` **blocks** expansion (`expand=false`).
4. Dwell must complete (`canary.expansion.dwell.ready === true`).
5. Do **not** expand while any of these fire:
   - hold failure rate above baseline
   - hold→confirm below baseline
   - redeem/issued below baseline
   - refund quote→applied gap / amount mismatch
6. Compare canary vs control cohorts on the admin dashboard.
7. **Persist evidence** for the peak window (required before advancing stage):

```bash
# Local process counters (CI dry-run / staging pod):
TOURS_CANARY_SNAPSHOT_LABEL=peak-staging-1 \
  pnpm run ops:tours-canary-snapshot

# Remote observation endpoint (staging/prod with bearer):
TOURS_CANARY_SNAPSHOT_URL="https://<host>/api/internal/observability/tours-rollout" \
FASTT_INFRA_HEALTH_TOKEN=... \
TOURS_CANARY_SNAPSHOT_LABEL=peak-allowlist-1 \
TOURS_CANARY_SNAPSHOT_REQUIRE_EXPAND=true \
  pnpm run ops:tours-canary-snapshot
```

Ephemeral CI dry-runs land under gitignored `artifacts/tours-canary/*.json`.
**Release evidence (A4)** is archived under tracked
`docs/ops/tours-canary-evidence/<runId>/` via:

```bash
# Full P0: observe remote (if token) + local-controlled stage walk gated by expand
pnpm run ops:tours-canary-p0

# Modes: auto (default) | remote | local
TOURS_CANARY_P0_MODE=remote pnpm run ops:tours-canary-p0
```

Each snapshot includes `releaseChecks`
(`holdFailureOk`, `holdConfirmOk`, `redeemIssuedOk`, `refundGapOk`, `expandReady`).
Keep at least one peak snapshot per stage dwell before expanding. See
`docs/ops/tours-canary-evidence/LATEST` for the newest run pointer.

8. Then advance: `staging` → `allowlist` → raise `TOURS_ROLLOUT_PERCENT` → `general`
   **only when** the latest peak snapshot has `releaseChecks.expandReady === true`.

Rollback: set `TOURS_ROLLOUT_STAGE=off` or flip the relevant `TOURS_*_ENABLED=false` (env-only).

## Day-of ops

Provider queue: `/booking/day-of` (today's tour salidas, check-in + voucher repair retry).
Convergent check-in: `POST /api/booking/check-in` redeems an `issued` voucher even when
Booking is already `checked_in` (`repaired: true`).

## Browser smoke (P1)

```bash
pnpm run test:tours:playwright
# Optional live PDP against a deployed host:
# PLAYWRIGHT_BASE_URL=https://<host> PLAYWRIGHT_TOUR_ID=<productId> pnpm run test:tours:playwright
```

Harnesses under `tests/e2e/fixtures/` cover PDP trust + ticket→price→hold and day-of
check-in/voucher repair without requiring a seeded marketplace DB.

## Metrics + alerts

- Counters dual-write to a process-shared Map and Redis (`INCR`) when configured.
- Labels: `stage`, `cohort` (`canary`|`control`|`unknown`), `provider_safe` (hashed).
- Prometheus rules: `docs/ops/tours-rollout.rules.yml`
- Scrape fragment: `docs/ops/prometheus/prometheus.tours.scrape.yml`
- Alertmanager fragment: `docs/ops/prometheus/alertmanager.tours.receivers.yml`
- Auth: `FASTT_INFRA_HEALTH_TOKEN` on prometheus + tours-rollout.
- `GET /api/internal/observability/tours-rollout` exposes `sharedStore.multipodReady`
  (`activeBackend` must be `redis` or `upstash-rest` for multi-pod aggregation).

```bash
# Validate rule ↔ emitted metric parity
pnpm run ops:tours-prometheus-rules

# Verify Redis cross-pod sync (exit 2 = Redis unset; exit 0 = ok)
pnpm run ops:tours-redis-multipod
# Require Redis in staging:
# TOURS_REDIS_CHECK_REQUIRE=true pnpm run ops:tours-redis-multipod
```

## Code entry points

- Canary decision: `src/lib/tours/tourRolloutCanary.ts`
- Shared store / dwell: `src/lib/tours/tourRolloutSharedStore.ts`
- Flag helpers + expansion: `src/lib/tours/tourObservability.ts`
- Tests: `tests/catalog/tour-rollout-canary.test.ts`, `tests/catalog/tour-rollout-observability.test.ts`
