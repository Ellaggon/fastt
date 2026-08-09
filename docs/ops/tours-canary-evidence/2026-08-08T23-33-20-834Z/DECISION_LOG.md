# Tours canary P0 evidence — 2026-08-08T23-33-20-834Z

- Captured: 2026-08-08T23:33:21.665Z
- Mode: `auto`
- Host: `https://fastt-five.vercel.app/api/internal/observability/tours-rollout`
- Final stage reached: `general`
- Blocked at: `off`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| remote | off | false | observed | hold_or_unavailable | `remote/DECISION_LOG.md` |
| local-controlled | general | true | healthy | archive | `local-controlled/DECISION_LOG.md` |

## Notes

- Auto mode: remote observation (A1/A2 against deployed host) + local-controlled A3 gate proof.
- Remote stage=off expandReady=false
- Host env stage advancement (A3 on Vercel) remains a manual/dashboard step when remote expandReady becomes true.
- Local-controlled archive completed through general.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

