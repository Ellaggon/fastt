# Supabase Migration Phase 0 Audit

Last updated: 2026-07-21

## Objective

Inventory the current database surface before migrating Fastt from Astro DB/libSQL/Turso to Supabase Postgres. This phase does not require Supabase credentials because it is a static codebase audit: schema, migrations, repositories, raw SQL, transactions, upserts, and critical endpoints.

## Executive Summary

Fastt currently uses Supabase for authentication but uses Astro DB over libSQL/Turso for business persistence.

Primary evidence:

- `astro.config.mjs` wires Astro DB with `@libsql/client`, `ASTRO_DB_REMOTE_URL`, and `ASTRO_DB_APP_TOKEN`.
- `package.json` depends on `@astrojs/db` and `@libsql/client`.
- `.env.example` separates Supabase auth variables from Astro DB/Turso variables.
- `db/config.ts` is the canonical schema source exported through `defineDb`.

The migration is viable, but it must be treated as a database platform migration, not a connection-string swap. The current persistence surface is broad and includes concurrency-sensitive booking/inventory flows, materialized search/pricing read models, handwritten SQL, and SQLite-specific migrations.

## Inventory Snapshot

| Area                                                             | Count |
| ---------------------------------------------------------------- | ----: |
| Canonical tables in `defineDb({ tables })`                       |    79 |
| Foreign-key style references in schema                           |    81 |
| Declared schema indexes                                          |   142 |
| SQL migration files in `db/migrations`                           |    62 |
| Files importing `astro:db`                                       |   227 |
| API endpoint files under `src/pages/api`                         |   149 |
| Infrastructure repository files                                  |    62 |
| Transaction call sites                                           |    19 |
| Upsert/conflict call sites                                       |   105 |
| Raw/run/execute/query matches, excluding tagged `sql` predicates |   101 |
| SQLite-specific matches                                          |   119 |
| Delete call matches                                              |   112 |

## Current Database Stack

Runtime stack:

- Astro server output.
- Astro DB integration.
- libSQL client for remote Turso.
- Direct `astro:db` virtual module imports across server-side app code.
- Supabase Auth via manual REST calls, not `@supabase/supabase-js`.

Important configuration points:

- `astro.config.mjs`: `integrations: [db(), react()]`.
- `astro.config.mjs`: `db.connection.client = "@libsql/client"`.
- `.env.example`: `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN`.
- `.env.example`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `SUPABASE_SERVICE_ROLE_KEY`.
- `.env.example`: commented `DATABASE_URL` and `DIRECT_URL`, currently unused for business DB.

## `astro:db` Surface

Direct imports are distributed as follows:

| Surface                            | Files |
| ---------------------------------- | ----: |
| `db/` schema and seed              |     2 |
| scripts                            |    12 |
| tests                              |    62 |
| API routes                         |    39 |
| SSR pages                          |    16 |
| module infrastructure repositories |    59 |
| other module infrastructure        |     2 |
| `src/lib` helpers/services         |    30 |
| containers                         |     2 |
| components                         |     2 |
| shared test support                |     1 |

Architectural note: the application layer is already guarded by `tests/architecture/application-layer-db-boundary.test.ts`, which asserts no direct `astro:db` imports under `src/modules/*/application`. This is a strong migration asset because business use cases can remain stable while infrastructure adapters are replaced.

## Schema Inventory By Domain

Provider, identity, governance, and financial provider state:

- `Provider`
- `ProviderProfile`
- `ProviderDocument`
- `ProviderTaxConfiguration`
- `ProviderPaymentAccount`
- `ProviderIntegrationConnection`
- `ProviderIntegrationSyncLog`
- `ProviderAuditLog`
- `ProviderComplianceAssignment`
- `ProviderConfigurationState`
- `ProviderVerification`
- `ProviderUser`
- `ProviderInvitation`
- `User`
- `ProviderFinancialProfile`
- `ProviderPayableSnapshot`
- `ProviderStatement`

Catalog and product model:

- `Destination`
- `RoomType`
- `AmenityRoom`
- `Service`
- `Image`
- `ImageUpload`
- `Translation`
- `Product`
- `HouseRule`
- `ProductStatus`
- `ProductPreparationSnapshot`
- `ProductContent`
- `ProductLocation`
- `Hotel`
- `Tour`
- `Package`
- `Limousine`
- `Variant`
- `VariantCapacity`
- `VariantRoomProfile`
- `VariantRoomBed`
- `VariantRoomAmenity`
- `VariantReadiness`
- `ProductService`
- `ProductServiceAttribute`

Policies:

- `PolicyGroup`
- `Policy`
- `PolicyAssignment`
- `CancellationTier`
- `PolicyRule`
- `PolicyExceptionRule`
- `PolicyAuditLog`

Inventory:

- `VariantInventoryConfig`
- `DailyInventory`
- `EffectiveAvailability`
- `InventoryLock`
- `Hold`

Pricing and search read model:

- `SearchUnitView`
- `RatePlan`
- `RatePlanOccupancyPolicy`
- `CommercialRuleSet`
- `CommercialRule`
- `CommercialRuleApplication`
- `EffectiveRestriction`
- `EffectivePricingV2`

Taxes and fees:

- `TaxFeeDefinition`
- `TaxFeeAssignment`
- `BookingTaxFee`

Booking:

- `Booking`
- `BookingRoomDetail`
- `BookingPolicySnapshot`

Financial operations:

- `FinancialExceptionRecord`
- `FinancialReference`
- `RefundHandoffRecord`
- `RefundQuote`
- `RefundLedger`
- `FinancialReviewEvent`
- `PaymentTransaction`
- `FinancialSettlementRecord`
- `ReconciliationMatch`
- `CommissionSnapshot`
- `PayoutRecord`

## Relationship Hotspots

High-dependency entity chains:

- Provider ownership: `Provider -> Product -> Variant -> RatePlan`.
- Availability: `Variant -> DailyInventory -> EffectiveAvailability -> SearchUnitView`.
- Booking: `Hold -> InventoryLock -> Booking -> BookingRoomDetail -> BookingPolicySnapshot -> BookingTaxFee`.
- Policy resolution: `PolicyGroup -> Policy -> PolicyRule/CancellationTier -> PolicyAssignment -> BookingPolicySnapshot`.
- Pricing materialization: `RatePlan -> RatePlanOccupancyPolicy -> EffectivePricingV2 -> SearchUnitView`.
- Commercial rules: `CommercialRuleSet -> CommercialRule -> CommercialRuleApplication -> EffectiveRestriction/EffectivePricingV2`.
- Provider governance: `Provider -> ProviderProfile/ProviderDocument/ProviderTaxConfiguration/ProviderPaymentAccount/ProviderConfigurationState`.
- Financial operations: `Booking/providerId` fan-out into payment transactions, settlements, reconciliation, refund quotes, refund ledger, exceptions, review events, payouts, statements.

Postgres migration implications:

- Foreign keys should be made explicit and consistent.
- Deletion behavior must be designed deliberately; current code often performs manual cascades.
- Unique indexes that support upserts must be preserved exactly.
- Materialized read-model rows need idempotent regeneration scripts after import.

## Index Inventory

The current Astro schema declares 142 indexes. Critical index groups to preserve or improve:

- Catalog lookup: `Product(providerId, productType)`, `Product(providerId)`, `Variant(productId, isActive)`, `Variant(productId, kind)`.
- Images: `Image(entityType, entityId)`, `Image(entityId)`, `ImageUpload(objectKey, status)`.
- Room/product services: `VariantRoomAmenity(variantId, amenityId)` unique, `ProductService(productId, serviceId)` unique.
- Policies: `Policy(groupId, version)` unique, `PolicyAssignment(scope, scopeId, category, channel, isActive)`, date-range policy indexes.
- Inventory: `DailyInventory(variantId, date)` unique, `EffectiveAvailability(variantId, date)` unique, `InventoryLock(variantId, date)`, `InventoryLock(holdId)`.
- Search/pricing read models: `SearchUnitView(variantId, ratePlanId, date, occupancyKey)` unique, `EffectivePricingV2(variantId, ratePlanId, date, occupancyKey)` unique, `EffectiveRestriction(variantId, ratePlanId, date)` unique.
- Booking: `Booking(providerId, status, checkInDate)`, `Booking(providerId, operationalStatus, checkOutDate)`, `Booking(ratePlanId)`.
- Financial queues: provider/status, bookingId, openedAt, occurredAt, settlementDate, idempotency keys, reconciliation review status.

Recommended Postgres refinement:

- Convert date-range lookup patterns into btree indexes that match exact predicates.
- Consider partial indexes for active rows: active policies, active rate plans, unexpired locks, open financial exceptions.
- Consider `citext` or functional unique index on lower-case email if case-insensitive user lookup remains.
- Use `jsonb` with targeted GIN indexes only where JSON fields become query predicates.

## Raw SQL And SQLite-Specific Findings

Raw SQL appears in two forms:

- Safe parameterized `sql` fragments inside Drizzle/Astro query builders.
- Handwritten SQL statements and schema-changing scripts.

SQLite-specific constructs found:

- `PRAGMA foreign_keys`
- `PRAGMA journal_mode`
- `PRAGMA busy_timeout`
- `pragma_table_info`
- `INSERT OR IGNORE`
- `unixepoch()`
- `strftime(...)`
- `date(...)` SQLite semantics
- `json_object`
- `json_group_array`
- `randomblob`
- `hex`
- `SQLITE_BUSY`
- `"database is locked"`

High-risk files:

- `db/migrations/*`: many historical migrations are SQLite-specific and should not be replayed directly on Supabase.
- `src/lib/commercial-rules/commercialRulesRepository.ts`: creates tables at runtime with raw SQL and SQLite timestamp defaults.
- `src/lib/rates/ratePlanSchemaCompat.ts`: probes SQLite table metadata via `pragma_table_info`.
- `src/modules/inventory/infrastructure/repositories/InventoryHoldRepository.ts`: handles `SQLITE_BUSY` and uses SQLite-compatible guarded updates.
- `src/test-support/astro-db.ts`: creates isolated SQLite/libSQL databases for Vitest.

Conclusion: create a clean Postgres baseline migration from the current desired schema instead of translating and replaying every historical Turso migration.

## Upserts

Upserts are common and mission-critical. They appear in:

- Search read-model materialization.
- Effective pricing and restrictions.
- Inventory recomputation and daily inventory mutation.
- Provider governance/configuration state.
- Tax configuration and payment accounts.
- Image upload completion.
- Seeds and test data.

Postgres migration requirement:

- Every `.onConflictDoUpdate` target must map to an actual unique index or primary key.
- `excluded.column` expressions must be ported to Postgres-compatible Drizzle syntax.
- Idempotency keys must remain unique: refund quotes, refund ledger, provider integrations, user email sync, etc.

## Transactions

Transaction call sites found: 19.

Critical transaction groups:

- Inventory hold/release.
- Booking from hold.
- Rate plan create/update/delete.
- Product service sync/delete.
- Provider creation.
- Policy command/versioning.
- Policy assignment replacement/deactivation.
- Booking policy snapshot insertion.
- Tax fee snapshot persistence.
- Commercial price rule write serialization.

Postgres migration requirement:

- Re-evaluate isolation and locking instead of porting SQLite retry behavior mechanically.
- For inventory, use row-level locks or atomic guarded updates with constraints.
- Preserve idempotency and ensure no overbooking under concurrent requests.
- Add tests for concurrent hold, release, confirm, and cancellation flows against Postgres.

## Deletes And Cascades

There are many manual cascade flows, especially:

- Product deletion.
- Variant deletion.
- Rate plan deletion.
- Product service deletion.
- Image/image upload cleanup.
- Policy rule/cancellation tier replacement.
- Inventory lock cleanup.

Postgres migration requirement:

- Decide table by table whether to keep application-managed cascades or enforce `ON DELETE CASCADE`.
- Do not blindly add cascading foreign keys where business rules require explicit cleanup ordering, R2 cleanup, audit logs, or financial immutability.

Recommended default:

- Application-managed cascades for product/variant/rate-plan deletion until behavior is fully covered by tests.
- Restrictive or nullable references for financial/audit records.
- Database-level cascade only for strictly owned child records with no external side effects.

## Critical Endpoint Inventory

Highest-risk write endpoints:

- `src/pages/api/inventory/hold.ts`
- `src/pages/api/inventory/release.ts`
- `src/pages/api/booking/confirm.ts`
- `src/pages/api/booking/cancel.ts`
- `src/pages/api/pricing/base-rate.ts`
- `src/pages/api/pricing/rules/v2/*`
- `src/pages/api/rates/plans.ts`
- `src/pages/api/rates/commercial-rules.ts`
- `src/pages/api/product/*`
- `src/pages/api/variant/*`
- `src/pages/api/products/[id]/delete.ts`
- `src/pages/api/products/services/*`
- `src/pages/api/uploads/complete.ts`
- `src/pages/api/policies/*`
- `src/pages/api/provider/settings/*`
- `src/pages/api/provider/tax-fees/*`
- `src/pages/api/provider/integrations/[connectorKey]/*`
- `src/pages/api/internal/financial/*`
- `src/pages/api/admin/providers/*`
- `src/pages/api/admin/policies/*`

Highest-risk read/materialization endpoints:

- `src/pages/api/search-v2.ts`
- `src/pages/api/internal/search/*`
- `src/pages/api/internal/observability/search-*`
- `src/pages/api/internal/materialization-health.ts`
- `src/pages/api/internal/inventory/*`
- `src/pages/api/internal/pricing-day-inspector.ts`
- `src/pages/api/internal/pricing/v2-shadow-report.ts`
- `src/pages/api/internal/dashboard-summary.ts`
- `src/pages/api/internal/rooms-summary.ts`
- `src/pages/api/internal/availability-summary.ts`
- `src/pages/api/products/[productId]/offers.ts`
- `src/pages/api/destinations.ts`

SSR pages with direct DB access should be migrated after repositories/adapters:

- hotel/package/tour search and detail pages
- product preview/subtype/room profile pages
- dashboard/rates/provider admin pages
- financial workspace component with server DB reads

## Test Infrastructure Impact

Current tests use `src/test-support/astro-db.ts` to create isolated local SQLite/libSQL DB files per Vitest worker. This is intentionally designed to avoid `SQLITE_BUSY` flakiness.

Postgres migration options:

1. Supabase local CLI for integration tests.
2. Testcontainers/Postgres if Docker is acceptable.
3. Dedicated local Postgres schema per worker.
4. PGlite for fast unit/integration tests where Postgres compatibility is sufficient.

Required changes:

- Replace `astro:db` test alias.
- Rebuild schema setup for Postgres.
- Recreate the test trigger that currently inserts default `RatePlanOccupancyPolicy` after `RatePlan` inserts, or move that defaulting into application/repository logic.
- Keep the architecture boundary test and add a new one forbidding new `astro:db` imports outside approved legacy surfaces during migration.

## Data Type Conversion Matrix

| Current Astro/libSQL type     | Postgres target                           | Notes                                                                      |
| ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `column.text` ids             | `text` or `uuid`                          | Keep `text` initially to avoid rewriting IDs.                              |
| `column.number` money/amounts | `numeric` for money, `integer` for counts | Avoid floating point for financial/pricing values where exactness matters. |
| `column.boolean`              | `boolean`                                 | Convert `0/1`, `"true"/"false"` if legacy rows exist.                      |
| `column.date` business dates  | `date`                                    | Use for check-in/check-out/effective dates.                                |
| `column.date` timestamps      | `timestamptz`                             | Use for created/updated/computed/opened/closed timestamps.                 |
| `column.json`                 | `jsonb`                                   | Validate serializable shape before import.                                 |
| SQLite `TEXT` JSON            | `jsonb`                                   | Needs parse/transform validation.                                          |
| SQLite epoch integer dates    | `timestamptz` or `date`                   | Normalize explicitly.                                                      |

## Migration Readiness Risks

P0 risks:

- Inventory concurrency and overbooking prevention.
- Booking confirmation from holds.
- Date normalization across policy/pricing/inventory.
- Runtime-created commercial rule tables.
- Search/pricing materialized rows consistency.

P1 risks:

- Manual cascade behavior during product/variant/rate-plan deletion.
- Supabase Auth user sync to `User`.
- Financial idempotency and immutable records.
- JSON field portability.
- Test infrastructure replacement.

P2 risks:

- SSR pages with direct DB access.
- Performance regressions from missing compound/partial indexes.
- Connection pooling configuration in Vercel/serverless.

## Freeze Decision

Turso migration freeze starts with this audit.

During the migration window:

- Do not add new SQL files under `db/migrations` for Turso/libSQL unless explicitly labeled as an emergency production hotfix.
- Do not add new `astro db execute` scripts for schema changes.
- Do not add new direct `astro:db` imports outside existing legacy surfaces.
- Any required schema change must be mirrored in the Supabase Postgres baseline plan.
- Emergency Turso hotfixes must include a companion Postgres migration note in this audit or the follow-up schema plan.

Recommended next guardrail:

- Add a test that fails if new `db/migrations/*.sql` files appear after the freeze date unless their filename includes `emergency` and they are listed in an allowlist.
- Add a test that reports new direct `astro:db` import files compared with this audit baseline.

## Phase 0 Result

Phase 0 is complete as a codebase audit. No Supabase credentials were required.

Before Phase 1, decide:

1. Postgres ORM strategy: recommended `drizzle-orm` with `pg-core`.
2. Test DB strategy: recommended local Postgres/Supabase local for integration tests, plus PGlite only if speed becomes a blocker.
3. Supabase project region: recommended `sa-east-1` Sao Paulo for the LATAM launch.
4. Migration discipline: clean Postgres baseline instead of replaying Turso migrations.
