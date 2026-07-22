# Supabase Migration - Phase 4 Critical Repositories

Date: 2026-07-22

## Objective

Move the critical database access surface away from direct `astro:db`/Turso coupling and onto the transitional Postgres infrastructure created in Phase 1, while keeping application ports and observable behavior intact.

The priority domains for this phase were:

- Inventory
- Pricing
- Search read model
- Booking
- Catalog
- Policies
- Financial

## Completed Scope

### Modular Infrastructure

All `src/modules/**` database imports were migrated from `astro:db` to:

```ts
@/shared/infrastructure/db/compat
```

This preserves the existing repository classes and application ports while routing execution through the new Postgres-ready database layer.

Legacy Astro query helpers were removed from module implementations:

- `.all()` was replaced with direct awaited Drizzle queries.
- `.get()` was replaced with `.then(first)`.
- `.run()` was replaced with executable Postgres-compatible query flow.

### Direct Access Cleanup

The cleanup pass was extended beyond modules to remove direct Turso/Astro DB imports from:

- `src/pages/**`
- `src/lib/**`

Result:

- No remaining `from "astro:db"` imports in `src/modules`, `src/lib`, or `src/pages`.
- No runtime `.all()`, `.get()`, or `.run()` calls remain in those paths.

### Transitional Compatibility Layer

`src/shared/infrastructure/db/compat.ts` now acts as the controlled bridge for legacy call sites during the migration window:

- Re-exports Drizzle operators and the Postgres schema.
- Provides `db` backed by the lazy runtime Postgres client.
- Provides `first()` for explicit single-row reads.
- Keeps a minimal `run`/transaction compatibility surface for transitional code.

### Postgres Numeric Boundaries

Postgres `numeric` columns are represented by Drizzle as strings to avoid precision loss. Repositories and endpoints touched in this phase now normalize numeric values at the correct boundaries:

- Monetary/price values are written as strings into Postgres numeric columns.
- Read models convert numeric strings back to numbers before returning API/domain DTOs where existing contracts expect numbers.

Affected areas include pricing, taxes/fees, product services, booking payments, inventory hold pricing, and commercial price rules.

## Validation

Commands executed successfully:

```bash
./node_modules/.bin/tsc --noEmit
pnpm exec astro check
```

Additional inventory checks:

```bash
rg -n 'from "astro:db"|from '\''astro:db'\''' src/pages src/lib src/modules
rg -n '\.get\(\)|\.all\(\)|\.run\(\)' src/pages src/lib src/modules
```

Results:

- TypeScript: pass.
- Astro check: 0 errors, 0 warnings.
- Direct `astro:db` imports: none in `src/modules`, `src/lib`, or `src/pages`.
- Legacy query method calls: none in `src/modules`, `src/lib`, or `src/pages`.

## Credentials Needed Later

This phase did not require live Turso or Supabase credentials because it was a code-level migration and compile validation phase.

Credentials will be required for the next live validation/data phases:

- Turso export:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
- Supabase/Postgres migration and load:
  - `DATABASE_URL`
  - `SUPABASE_DB_POOLER_URL`
  - `DIRECT_URL`

## Remaining Professional Follow-Up

Before production cutover, execute a live database validation pass against Supabase:

1. Apply `db/postgres/0001_initial_schema.sql` to a Supabase staging database.
2. Export a Turso snapshot using the Phase 3 export script.
3. Transform and load the snapshot into Supabase.
4. Run endpoint smoke tests for inventory, pricing, search, booking, catalog, policies, and financial.
5. Capture query latency before and after moving reads to Supabase in the Latin America deployment path.
