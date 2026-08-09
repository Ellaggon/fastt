# P0 execution status — 2026-08-08

## A1 — staging + flags — DONE

Host: `https://fastt-five.vercel.app` (Vercel project `fastt`)

Set on **Production** and **Preview**:

- `TOURS_CHECKOUT_ENABLED=true`
- `TOURS_CHECKIN_ENABLED=true`
- `TOURS_PUBLIC_SEARCH_ENABLED=true`
- `TOURS_REFUND_HOURS_ENABLED=true`
- `TOURS_ROLLOUT_STAGE=staging`
- `TOURS_ROLLOUT_PERCENT=10`
- `TOURS_PROVIDER_ALLOWLIST=prov_canary_a`
- `TOURS_ROLLOUT_STAGING_HOSTS=localhost,127.0.0.1`

Redeploy completed and aliased to `https://fastt-five.vercel.app`.

Effect:

- Production (`VERCEL_ENV=production`) + stage `staging` → commerce stays off (`staging_mismatch`) for the public prod host.
- Preview deployments receive canary commerce (`VERCEL_ENV=preview`).

## A2 — peak snapshot — DONE (held by dwell)

Remote observation archived:

- `01_observe_staging.json`
- `releaseChecks`: hold/confirm/redeem/refund **OK**
- `expandReady=false` because dwell remaining ≈ 24h (`TOURS_ROLLOUT_MIN_DWELL_MS` default)

## A3 — allowlist→%→general — HELD (correct)

Not advanced. Gate requires `expandReady=true` before flipping host env.

After dwell completes and a new peak snapshot stays healthy:

```bash
# 1) Confirm expand
TOURS_CANARY_P0_MODE=remote \
TOURS_CANARY_SNAPSHOT_REQUIRE_EXPAND=true \
  pnpm run ops:tours-canary-snapshot

# 2) Only then flip Vercel env:
#    staging → allowlist → percentage → general
#    (redeploy after each flip; keep a peak snapshot per stage)
```

Local-controlled gate proof (Redis-isolated) already walked staging→general with expandReady=true in run `2026-08-08T23-33-20-834Z/local-controlled/`.

## A4 — archive outside gitignored artifacts — DONE

Tracked under `docs/ops/tours-canary-evidence/` (see `LATEST`).
Ephemeral CI dry-runs remain in `artifacts/tours-canary/`.
