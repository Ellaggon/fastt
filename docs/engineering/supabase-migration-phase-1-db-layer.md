# Supabase Migration Phase 1 DB Layer

Last updated: 2026-07-21

## Objective

Introduce a parallel Supabase Postgres database layer without changing runtime behavior. Existing application code continues using `astro:db` until repositories are migrated deliberately.

## Added Surface

- `src/shared/infrastructure/db/env.ts`
- `src/shared/infrastructure/db/client.ts`
- `src/shared/infrastructure/db/adapter.ts`
- `src/shared/infrastructure/db/schema/index.ts`
- `src/shared/infrastructure/db/schema/registry.ts`
- `src/shared/infrastructure/db/schema/tables.ts`

## Environment Variables

- `DATABASE_URL`: fallback runtime Postgres URL.
- `SUPABASE_DB_POOLER_URL`: preferred runtime URL for serverless traffic.
- `DIRECT_URL`: direct Postgres URL for migrations, dumps, restores, and admin tasks.

Runtime URL resolution:

1. `SUPABASE_DB_POOLER_URL`
2. `DATABASE_URL`

Direct/admin URL resolution:

1. `DIRECT_URL`
2. runtime fallback

## Dependency Notes

The new layer is designed for:

- `drizzle-orm`
- `postgres`

`pnpm add drizzle-orm postgres` was attempted but the local install is blocked by a pnpm/node_modules state mismatch. `package.json` now declares the dependencies; the lockfile still needs to be refreshed with a clean install.

## Behavior Guarantee

No current container, repository, page, or API route imports this new DB layer yet. This phase only prepares the Postgres foundation.

## Schema Scope

`schema/registry.ts` lists the 79 current canonical table names by migration domain.

`schema/tables.ts` starts the Drizzle Postgres schema with the critical migration path:

- identity/provider ownership
- catalog product/variant/rate-plan spine
- inventory hold/lock/availability
- booking core tables
- pricing/search materialized tables
- booking policy snapshots
- migration audit checkpoints

Phase 2 should expand this into the full Postgres baseline schema and reconcile exact column types for every table.
