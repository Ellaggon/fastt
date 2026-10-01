# Tours canary evidence (P0 archive)

Status: active
Document type: index
Owner: Tours / Operations
Last verified: 2026-10-01
Scope: archivo de evidencias canary; no especifica comportamiento vigente
Source of truth: artefactos fechados y manifiestos de cada ejecución
Review trigger: cambio de contrato o procedimiento; revisar código y evidencia antes de operar

Tracked release evidence for staging → allowlist → % → general.

| Path | Purpose |
| ---- | ------- |
| `<runId>/` | One P0 run (decision log + peak JSON snapshots) |
| `LATEST` | Pointer to the newest run |
| gitignored `artifacts/tours-canary/` | Ephemeral CI dry-runs only |

## Generate

```bash
pnpm run ops:tours-canary-p0
```

Requires `FASTT_INFRA_HEALTH_TOKEN` for remote observation against
`PUBLIC_APP_URL` / `SITE_URL` / `https://fastt-five.vercel.app`.

## Advance rule

Do **not** flip host `TOURS_ROLLOUT_STAGE` forward unless the peak snapshot for
the current stage has `releaseChecks.expandReady === true`.
