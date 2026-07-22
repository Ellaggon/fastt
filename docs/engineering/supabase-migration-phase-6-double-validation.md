# Supabase Migration - Phase 6 Double Validation

Date: 2026-07-22

## Objective

Run behavioral validation against Postgres after the Turso to Supabase data load, then add focused coverage for the critical migration risks:

- Inventory concurrency.
- Booking confirmation.
- Search/pricing materialization.
- Auth session to `User` synchronization.

## Status

Phase 6 is partially complete.

Completed:

- Added dedicated Postgres validation tests.
- Executed the new Postgres validation suite against Supabase staging.
- Fixed Postgres compatibility issues found by those tests.
- Executed TypeScript validation.
- Executed the full Vitest suite once to inventory remaining failures.

Still pending:

- Make the legacy/global Vitest harness fully Postgres-aware.
- Triage and migrate the remaining failing legacy tests that still assume isolated `astro:db` test behavior or old guardrail table names.

## New Test Coverage

Added:

- `tests/postgres/phase6-postgres-validation.test.ts`

Coverage:

- Inventory concurrency:
  - Two concurrent guarded Postgres updates compete for one unit.
  - Exactly one reservation succeeds.
  - `reservedCount` never exceeds `totalInventory`.

- Booking confirmation:
  - Confirms a booking from a held inventory snapshot.
  - Persists `Booking`, `BookingRoomDetail` and `BookingTaxFee`.
  - Links `InventoryLock.bookingId`.
  - Re-confirming the same hold returns the original booking idempotently.

- Search/pricing materialization:
  - Persists aligned `SearchUnitView` and `EffectivePricingV2` rows.
  - Validates join integrity by `variantId`, `ratePlanId`, `date` and `occupancyKey`.
  - Confirms price parity between `SearchUnitView.pricePerNight` and `EffectivePricingV2.finalBasePrice`.

- Auth-user sync:
  - Runs two concurrent `ensureUserForSession` calls with the same email.
  - Confirms a single canonical `User` row.
  - Confirms both callers receive the persisted canonical user id.

## Fixes Applied From Phase 6 Findings

- `src/modules/identity/application/use-cases/ensure-user-for-session.ts`
  - Re-reads the canonical user after `onConflictDoNothing`.
  - Fixes a race where concurrent auth sync could return a UUID that was not actually persisted.

- `src/lib/rates/ratePlanSchemaCompat.ts`
  - Uses Postgres `information_schema.columns` first.
  - Keeps legacy `pragma_table_info('RatePlan')` fallback for Turso/libSQL compatibility.

- `src/modules/inventory/infrastructure/repositories/InventoryHoldRepository.ts`
  - Uses `returning()` to count affected rows after guarded inventory updates.
  - Removes reliance on SQLite-style `rowsAffected`/`changes` for the Postgres critical path.

- `src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts`
  - Uses `returning()` to count consumed inventory locks.
  - Fixes false `HOLD_ALREADY_CONFIRMED` errors on successful Postgres updates.

## Commands Executed

```bash
./node_modules/.bin/tsc --noEmit
pnpm exec vitest run tests/postgres/phase6-postgres-validation.test.ts
pnpm exec vitest run
```

## Passing Validation

Postgres-specific suite:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

TypeScript:

```text
tsc --noEmit: passed
```

## Full Suite Inventory

The full Vitest suite was executed once after adding the Postgres tests.

Result:

```text
Test Files  79 failed | 133 passed | 1 skipped (213)
Tests       220 failed | 470 passed | 1 skipped (691)
```

Primary failure categories:

- Legacy/global tests do not load `.env`, so code paths migrated to the Postgres compatibility layer fail with:

```text
Postgres database is not configured. Expected SUPABASE_DB_POOLER_URL or DATABASE_URL.
```

- Several guardrail tests still look for pre-migration table aliases/names such as `CommissionSnapshotTable`, `RefundQuoteTable` and other old financial write-boundary labels.

- Some integration tests still assume the old isolated `astro:db` harness while the implementation under test now uses the Postgres runtime compatibility layer.

## Repeat Commands

Focused Postgres validation:

```bash
pnpm test:postgres
```

Full suite inventory:

```bash
pnpm exec vitest run
```

## Recommendation

Before production cutover, add a dedicated Postgres integration harness that creates an isolated disposable schema/database per run, applies `db/postgres/0001_initial_schema.sql`, seeds fixtures, and runs migrated integration tests against that isolated Postgres target. The current staging validation proves the critical Postgres paths work, but the legacy suite still needs harness migration before it can be used as a full green release gate.
