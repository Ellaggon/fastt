# Tours canary P0 evidence — 2026-08-08T23-32-31-937Z

- Captured: 2026-08-08T23:32:36.917Z
- Mode: `auto`
- Host: `https://fastt-five.vercel.app/api/internal/observability/tours-rollout`
- Final stage reached: `allowlist`
- Blocked at: `off`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| remote | off | false | observed | hold_or_unavailable | `remote/DECISION_LOG.md` |
| local-controlled | allowlist | false | blocked | hold | `local-controlled/DECISION_LOG.md` |

## Notes

- Auto mode: remote observation (A1/A2 against deployed host) + local-controlled A3 gate proof.
- Remote stage=off expandReady=false
- Host env stage advancement (A3 on Vercel) remains a manual/dashboard step when remote expandReady becomes true.
- Local-controlled archive stopped early.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

