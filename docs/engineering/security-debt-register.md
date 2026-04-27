# Security & Technical Debt Register (Phase H)

Last updated: 2026-04-27

## Scope

This register captures unresolved dependency/security debt after the Astro 6 migration and stabilizations.

## Current dependency security status

Audit baseline command:

```bash
npm audit --json
```

Current summary:

- Total vulnerabilities: 7
- High: 2
- Moderate: 5
- Critical: 0

## Active items

### 1) `drizzle-orm` vulnerability via `@astrojs/db` (HIGH)

- Package chain: `@astrojs/db@0.17.2 -> drizzle-orm@0.42.0`
- Advisory: `GHSA-gpj5-g38j-94v9` (SQL injection via improperly escaped SQL identifiers)
- Audit range affected: `<0.45.2`
- Resolution status: **Unresolved (upstream-coupled)**

Attempts executed:

1. Upgrade `@astrojs/db` to latest (`0.20.1`)
   - Result: broke test runtime API (`createLocalDatabaseClient` not exported as expected by test bootstrap).
2. Override `drizzle-orm` to `0.45.2`
   - Result: build/check passed, but integration concurrency invariant failed:
     - `tests/integration/inventory-hold.test.ts`
     - `concurrent safety: two holds race; only one succeeds`
     - Expected one conflict (`409`), observed zero conflicts.

Decision:

- Keep stable/runtime-safe combination (`@astrojs/db@0.17.2`, no `drizzle-orm` override).
- Treat as accepted residual risk until upstream-compatible path exists.

Exit criteria to close:

- Either:
  - `@astrojs/db` release compatible with current test/runtime contracts and patched Drizzle, or
  - internal migration plan that updates test bootstrap + concurrency behavior without domain regressions.

### 2) `path-to-regexp` transitives via Vercel adapter (RESOLVED)

- Chain: `@astrojs/vercel@10.0.5 -> @vercel/routing-utils@5.3.3 -> path-to-regexp`
- Action applied: `overrides.path-to-regexp = 6.3.0`
- Runtime validation:
  - SSR build OK
  - Preview smoke endpoints OK
  - No API contract drift observed
- Status: **Resolved**

### 3) Dev/build-only Astro language tooling transitives (MODERATE)

Impacted chain:

- `@astrojs/check -> @astrojs/language-server -> volar-service-yaml -> yaml-language-server -> yaml`

Status:

- **Mitigated by scope** (developer tooling, non-runtime path)
- No direct production SSR/API path uses these packages.

Exit criteria:

- Upgrade path from Astro tooling ecosystem that bumps vulnerable transitives.

## Technical debt (non-security) tracked from same area

1. Dependency override maintenance (`path-to-regexp`)
   - Priority: Medium
   - Type: Operational debt
   - Owner action: remove override when adapter tree ships patched transitive by default.

2. DB test bootstrap compatibility coupling (`src/test-support/astro-db.ts`)
   - Priority: High
   - Type: Upgrade coupling debt
   - Owner action: decouple bootstrap from unstable runtime internals exposed by `@astrojs/db` changes.

3. Concurrency invariant sensitivity in hold flow under ORM changes
   - Priority: High
   - Type: Behavioral upgrade risk
   - Owner action: keep dedicated invariant tests as gate for any DB/ORM upgrade.

## Accepted risk statement

Given current repo constraints (no domain behavior changes allowed in this phase), keeping `drizzle-orm` unresolved is a conscious stability-first decision, with explicit monitoring and upgrade re-evaluation gates.
