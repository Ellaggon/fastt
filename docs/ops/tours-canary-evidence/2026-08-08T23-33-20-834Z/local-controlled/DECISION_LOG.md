# Tours canary P0 evidence — 2026-08-08T23-33-20-834Z-local

- Captured: 2026-08-08T23:33:21.664Z
- Mode: `local-controlled`
- Host: _local-controlled_
- Final stage reached: `general`
- Blocked at: _none_

## Sequence

| Step | Stage | expandReady | health | Decision | Snapshot |
| ---- | ----- | ----------- | ------ | -------- | -------- |
| A2-staging | staging | true | healthy | advance | `01_peak_staging.json` |
| A2-allowlist | allowlist | true | healthy | advance | `02_peak_allowlist.json` |
| A2-percentage | percentage | true | healthy | advance | `03_peak_percentage.json` |
| A2-general | general | true | healthy | archive | `04_peak_general.json` |

## Notes

- Local-controlled peak simulation: seeds healthy counters per stage with dwell satisfied.
- Redis env is disabled for this mode so seeds never dual-write shared counters.
- Use this to prove the expand gate + archive path when remote traffic/sample is unavailable.
- Production general still requires remote peak evidence with expandReady=true.
- A3 advanced staging → allowlist because expandReady=true
- A3 advanced allowlist → percentage because expandReady=true
- A3 advanced percentage → general because expandReady=true
- A3 reached general with expandReady=true; A4 archive complete.

## A4 archive policy

Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).
Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.

