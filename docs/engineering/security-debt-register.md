# Security & Technical Debt Register (Phase H)

Last updated: 2026-07-28

## Scope

This register captures unresolved dependency/security debt after the Astro 6 migration and
stabilizations. Vulnerability counts in this document are the last known audit result, not
a live security status.

## Last audited dependency security status

Last audit date: 2026-04-27

Audit baseline command:

```bash
pnpm audit --json
```

Last known summary:

- Total vulnerabilities: 7
- High: 2
- Moderate: 5
- Critical: 0

## Next audit required

Run a fresh `pnpm audit --json` in a dedicated audit phase before using this register for
merge, release or security-risk decisions. Package registry access may require network
approval in sandboxed environments.

## Resolved items

### 1) Legacy `drizzle-orm` vulnerability via `@astrojs/db` (RESOLVED)

- Former package chain: `@astrojs/db@0.17.2 -> drizzle-orm@0.42.0`
- Advisory: `GHSA-gpj5-g38j-94v9` (SQL injection via improperly escaped SQL identifiers)
- Resolution status: **Resolved by removing Astro DB/libSQL and using the canonical PostgreSQL adapter**

Final action:

- Removed `@astrojs/db`, `@libsql/client`, the Astro DB integration and the libSQL test bootstrap.
- All runtime and test persistence paths now enter through `src/shared/infrastructure/db/compat.ts`.
- Added an architecture test that prevents Astro DB/Turso dependencies and environment variables from returning.

## Active items

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

2. Concurrency invariant sensitivity in hold flow under ORM changes
   - Priority: High
   - Type: Behavioral upgrade risk
   - Owner action: keep dedicated invariant tests as gate for any DB/ORM upgrade.

## Current database position

Supabase PostgreSQL is the only canonical database. Dependency risk must be assessed against
the installed `drizzle-orm` and `postgres` versions, not the removed Astro DB/libSQL chain.
