# Supabase Migration - Phase 5 Data

Date: 2026-07-22

## Objective

Export Turso data, transform SQLite/libSQL values into the Postgres final schema, load into Supabase staging, and validate row counts, critical checksums, and functional read paths.

## Status

Phase 5 is complete against Supabase staging.

Completed:

- Turso export completed.
- Legacy schema drift handled.
- Postgres transformation completed.
- Nullability validation completed with 0 warnings.
- Supabase staging schema applied from the clean Postgres initial schema.
- Supabase staging load completed with `FASTT_SUPABASE_TRUNCATE=1`.
- Supabase count/checksum validation completed for all final-schema tables.
- Functional read validation completed for provider/catalog, pricing and booking/financial paths.

Recommended additional envs for runtime smoke tests:

- `DATABASE_URL`
- `SUPABASE_DB_POOLER_URL`

## Scripts Added/Updated

- `scripts/db/turso-to-supabase/export-turso.ts`
  - Loads `.env`.
  - Accepts `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` or legacy `ASTRO_DB_REMOTE_URL`/`ASTRO_DB_APP_TOKEN`.
  - Introspects source columns with `PRAGMA table_info`.
  - Exports source columns even when the Postgres final schema has drifted.
  - Exports auxiliary legacy `RatePlanTemplate` for deriving final `RatePlan.name` and `RatePlan.description`.

- `scripts/db/turso-to-supabase/transform-for-postgres.ts`
  - Loads `.env`.
  - Converts booleans, json/jsonb, dates, timestamps, integers and numeric values.
  - Derives `PolicyAssignment.category` from `PolicyGroup` when legacy rows are missing it.
  - Derives `RatePlan.name`/`description` from `RatePlanTemplate`.
  - Deduplicates legacy duplicate `Destination.slug` values with a stable id suffix.
  - Nulls stale optional `PolicyAuditLog` foreign-key references when historical audit rows point at records no longer present after Turso-side deduplication.

- `scripts/db/turso-to-supabase/apply-supabase-schema.ts`
  - Applies `db/postgres/0001_initial_schema.sql` to Supabase via `DIRECT_URL`.

- `scripts/db/turso-to-supabase/load-supabase.ts`
  - Loads transformed JSONL into Supabase via `DIRECT_URL`.
  - Supports `FASTT_SUPABASE_TRUNCATE=1`.
  - Computes dependency-aware table order from the Drizzle schema before loading.

- `scripts/db/turso-to-supabase/validate-supabase-load.ts`
  - Validates counts by table.
  - Computes SHA-256 checksums from transformed JSONL and Supabase table reads using canonical Postgres type normalization.
  - Runs functional read probes for provider/catalog, rate plan/pricing and booking/financial joins.

## Commands Executed

```bash
pnpm exec tsx scripts/db/turso-to-supabase/export-turso.ts
pnpm exec tsx scripts/db/turso-to-supabase/transform-for-postgres.ts
pnpm exec tsx scripts/db/turso-to-supabase/apply-supabase-schema.ts
FASTT_SUPABASE_TRUNCATE=1 pnpm exec tsx scripts/db/turso-to-supabase/load-supabase.ts
pnpm exec tsx scripts/db/turso-to-supabase/validate-supabase-load.ts
./node_modules/.bin/tsc --noEmit
```

## Data Results

- Final tables exported: 79
- Auxiliary legacy tables exported: 1 (`RatePlanTemplate`)
- Final tables transformed: 79
- Transformed rows: 3,596
- Nullability warnings: 0
- Supabase staging tables loaded: 79
- Supabase staging rows loaded: 3,596
- Non-empty Supabase staging tables: 43
- Validation mismatches: 0

Non-empty transformed tables:

```text
Provider:1, ProviderVerification:1, ProviderUser:1, User:2,
Destination:3, RoomType:2, AmenityRoom:14, Service:41,
Image:10, ImageUpload:5, Product:3, HouseRule:2,
ProductStatus:3, ProductPreparationSnapshot:3, ProductContent:3,
ProductLocation:3, Hotel:3, Variant:4, VariantCapacity:4,
VariantRoomProfile:4, VariantRoomBed:2, VariantRoomAmenity:6,
VariantReadiness:2, PolicyGroup:10, Policy:10, PolicyAssignment:9,
CancellationTier:5, PolicyRule:23, PolicyAuditLog:29,
VariantInventoryConfig:3, DailyInventory:1097,
EffectiveAvailability:397, InventoryLock:5, SearchUnitView:1531,
RatePlan:4, RatePlanOccupancyPolicy:2, CommercialRuleSet:6,
CommercialRule:6, CommercialRuleApplication:6,
EffectivePricingV2:328, BookingTaxFee:1, Booking:1,
BookingRoomDetail:1
```

Generated local artifacts:

- `tmp/turso-export/manifest.json`
- `tmp/turso-export/*.jsonl`
- `tmp/postgres-import/manifest.json`
- `tmp/postgres-import/*.jsonl`
- `tmp/postgres-import/load-result.json`
- `tmp/postgres-import/validation-report.json`

## Validation Summary

- Tables validated: 79
- Count validation: 79/79 passed
- Checksum validation: 79/79 passed
- Report status: `ok: true`

Functional read probes:

- Provider catalog join rows: 4
- Rate plan/pricing join rows: 331
- Booking/financial join rows: 1

Critical table counts:

- `Provider`: 1
- `Product`: 3
- `Variant`: 4
- `RatePlan`: 4
- `SearchUnitView`: 1,531
- `DailyInventory`: 1,097
- `EffectivePricingV2`: 328
- `Booking`: 1
- `Policy`: 10
- `PaymentTransaction`: 0

## Data Normalization Notes

- `Destination.slug`: one duplicate legacy slug was made unique with a deterministic suffix based on the destination id.
- `PolicyAuditLog`: stale optional references to missing historical users, policies, groups or assignments are stored as `null` instead of creating synthetic records.
- Postgres-native readback normalization is expected for `date`, `numeric(scale)` and `real` values. The validation checksum canonicalizes those types before comparing source JSONL against Supabase.

## Important Safety Note

Use a staging database only. `FASTT_SUPABASE_TRUNCATE=1` intentionally truncates all final-schema tables before loading transformed data.
