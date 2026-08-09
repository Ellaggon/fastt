# Tours canary P0 evidence — 2026-08-08T23-32-31-937Z-remote

- Captured: 2026-08-08T23:32:33.890Z
- Mode: `remote`
- Host: `https://fastt-five.vercel.app/api/internal/observability/tours-rollout`
- Final stage reached: `off`
- Blocked at: `off`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| A2 | off | false | degraded | hold | `01_observe_off.json` |

## Notes

- Remote mode observes deployed counters; it does not mutate Vercel/host env vars.
- Advance staging→allowlist→%→general only after expandReady=true on each peak snapshot.
- expandReady=false — hold at off. Blockers: hold_to_confirm 0.2500 < baseline 0.5500; dwell_remaining_ms 86399998 (min 86400000 since stage off)
- A3 host env mutations require Vercel/dashboard access; this run archives observation evidence only.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

