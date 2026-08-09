# Tours canary P0 evidence — 2026-08-08T23-50-10-731Z

- Captured: 2026-08-08T23:50:12.978Z
- Mode: `remote`
- Host: `https://fastt-five.vercel.app/api/internal/observability/tours-rollout`
- Final stage reached: `staging`
- Blocked at: `staging`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| A2 | staging | false | healthy | hold | `01_observe_staging.json` |

## Notes

- Remote mode observes deployed counters; it does not mutate Vercel/host env vars.
- Advance staging→allowlist→%→general only after expandReady=true on each peak snapshot.
- expandReady=false — hold at staging. Blockers: dwell_remaining_ms 86399998 (min 86400000 since stage staging)
- A3 host env mutations require Vercel/dashboard access; this run archives observation evidence only.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

