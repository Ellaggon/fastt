# Dependency Security Monitoring Runbook

Last updated: 2026-04-27

## Purpose

Provide an executable routine for monitoring unresolved dependency security debt without introducing regressions.

## Cadence

- Weekly: quick audit + vulnerability diff
- Monthly: full upgrade attempt window on a feature branch
- Trigger-based (immediate): when upstream releases in `@astrojs/db`, `@astrojs/vercel`, or Astro core

## Required commands

### Weekly check

```bash
npm install
npm audit --json
npm ls drizzle-orm @astrojs/db path-to-regexp @astrojs/vercel @vercel/routing-utils
```

Decision trigger:

- If counts or severity increased, open/refresh debt issue immediately.

### Full validation gate (for any dependency change)

```bash
npm run check
npx tsc --noEmit
npm test
npm run build
```

If any command fails:

- Stop rollout.
- Revert attempted dependency bump.
- Record failure evidence and impacted tests/files.

## Upgrade protocol for sensitive packages

### A) `@astrojs/db` / `drizzle-orm`

1. Attempt package bump in isolated branch.
2. Run full validation gate.
3. Mandatory targeted check:
   - `tests/integration/inventory-hold.test.ts` concurrent safety case.
4. Only merge if no functional invariant drift.

### B) `@astrojs/vercel` / `path-to-regexp`

1. Verify if override can be removed safely.
2. Validate preview endpoint smoke:
   - `/api/internal/observability/search-view-health`
   - `/api/internal/observability/search-decision`
   - `/hotels/search-v2`
3. If any contract drift appears, keep override and document.

## Severity handling policy

- High/Critical in runtime dependency:
  - attempt fix within current sprint
  - if blocked by regressions, record explicit accepted-risk decision with owner/date.
- Moderate dev/build-only:
  - batch in monthly tooling maintenance unless exploitability changes.

## Required record per attempt

For each remediation attempt, log:

1. Dependency and versions tried
2. Exact command outputs (or summarized failures)
3. Validation results
4. Decision:
   - Fixed
   - Mitigated
   - Deferred (with reason)

## Exit criteria to clear current debt

1. `drizzle-orm` advisory no longer present in audit
2. No override required for `path-to-regexp`
3. Full validation gate green
4. No contract drift in critical internal observability/search endpoints
