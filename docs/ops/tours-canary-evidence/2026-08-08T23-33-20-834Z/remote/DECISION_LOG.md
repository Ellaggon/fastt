# Tours canary P0 evidence — 2026-08-08T23-33-20-834Z-remote

- Captured: 2026-08-08T23:33:21.632Z
- Mode: `remote`
- Host: `https://fastt-five.vercel.app/api/internal/observability/tours-rollout`
- Final stage reached: `off`
- Blocked at: `off`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| A2 | off | false | healthy | hold | `01_observe_off.json` |

## Notes

- Remote mode observes deployed counters; it does not mutate Vercel/host env vars.
- Advance staging→allowlist→%→general only after expandReady=true on each peak snapshot.
- expandReady=false — hold at off. Blockers: dwell_remaining_ms 86352288 (min 86400000 since stage off)
- A3 host env mutations require Vercel/dashboard access; this run archives observation evidence only.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

