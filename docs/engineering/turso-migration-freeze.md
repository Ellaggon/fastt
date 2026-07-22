# Turso Migration Freeze

Effective date: 2026-07-21

## Purpose

Fastt is entering the Turso to Supabase Postgres migration window. The goal is to avoid schema drift while the Postgres baseline, migration scripts, and validation plan are prepared.

## Freeze Rules

- No new Turso/libSQL schema migrations under `db/migrations` unless they are emergency production hotfixes.
- No new schema-changing `astro db execute` scripts unless explicitly tied to an emergency hotfix.
- No new direct `astro:db` imports in application-layer code.
- New persistence work should target the Supabase/Postgres migration plan or be documented as legacy Turso debt.
- If an emergency Turso migration is unavoidable, it must include a companion Postgres note before Phase 1 closes.

## Allowed During Freeze

- Static analysis and documentation.
- Read-only audits.
- Test updates that document current behavior.
- Bug fixes that do not alter schema.
- Emergency hotfixes explicitly labeled in commit/PR notes.

## Recommended Automation

After the migration plan is approved, add guardrails that:

- Fail CI when new `db/migrations/*.sql` files are added without allowlist approval.
- Fail CI when new `astro:db` import files appear outside approved legacy surfaces.
- Require every emergency Turso migration to name its corresponding Postgres migration.
