# Tours canary P0 evidence — 2026-08-08T23-32-31-937Z-local

- Captured: 2026-08-08T23:32:36.917Z
- Mode: `local-controlled`
- Host: _local-controlled_
- Final stage reached: `allowlist`
- Blocked at: `allowlist`

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| A2-staging | staging | true | healthy | advance | `01_peak_staging.json` |
| A2-allowlist | allowlist | false | degraded | hold | `02_peak_allowlist.json` |

## Notes

- Local-controlled peak simulation: seeds healthy counters per stage with dwell satisfied.
- Use this to prove the expand gate + archive path when remote traffic/sample is unavailable.
- Production general still requires remote peak evidence with expandReady=true.
- A3 advanced staging → allowlist because expandReady=true
- Held at allowlist: expandReady=false blockers=refund_quote_gap 0.5000 > 0.2500

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

