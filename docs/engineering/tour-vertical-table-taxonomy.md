# Tour Vertical Table Taxonomy

Sibling of [`rooms-rates-table-taxonomy.md`](./rooms-rates-table-taxonomy.md).
Defines how lodging-shaped columns map to tours/experiences without a second booking engine.

## Semantic mapping (source of truth)

| Physical column / table              | Tour meaning                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `Variant` with `kind = tour_slot`    | Product option / salida (Viator option, Airbnb schedule template)            |
| `DailyInventory.date`                | Departure calendar date                                                      |
| `Booking.checkInDate`                | `departureDate`                                                              |
| `Booking.checkOutDate`               | End of activity window (`departureDate + 1` for day tours, or multi-day end) |
| `BookingRoomDetail`                  | Booking line item (not a hotel room) — app alias `BookingLineItem`           |
| `SearchUnitView.pricePerNight`       | Price per participant / unit                                                 |
| `CancellationTier.daysBeforeArrival` | Days before departure (MVP)                                                  |
| `VariantCapacity.maxOccupancy`       | Max participants (pax) on the salida                                         |

## Tour content columns (Fase 1)

| Column                                                                 | Role                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Tour.duration`                                                        | Display label (legacy free text)                                                                         |
| `Tour.durationMinutes`                                                 | Queryable duration in minutes                                                                            |
| `Tour.includesJson` / `excludesJson`                                   | Aligned with Package                                                                                     |
| `ProductCategory` + `ProductCategoryLink`                              | Canonical discovery taxonomy; managed in `/product/[id]/tickets`                                          |
| `Tour.pickupJson`                                                      | Optional pickup logistics (Limousine pattern)                                                            |
| `Tour.meetingPointJson` / `itineraryJson` / `safetyJson` / `guideJson` | Existing structured JSON                                                                                 |

## Tour JSON shapes inventory (Fase 0 contract)

Shapes as produced by the provider forms. Create and update paths build identical
payloads (`create-product-subtype.ts` and `api/product/subtype.ts` PUT); `tourSchema`
(`src/schemas/product/subtype.ts`) accepts them as `z.unknown()` — these shapes are
the de-facto contract, pinned by `tests/catalog/tour-semantics.test.ts`.

| Column             | Shape                                                                                                | Form fields (source)                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `meetingPointJson` | `{ address?: string, instructions?: string }` (object omitted if all empty)                          | `meetingPointAddress`, `meetingPointInstructions` |
| `itineraryJson`    | `Array<{ step: number (1-based), description: string }>`                                             | `tourItinerary` (one line per step)               |
| `safetyJson`       | `{ requirements?: string, warnings?: string }`                                                       | `safetyRequirements`, `safetyWarnings`            |
| `guideJson`        | `{ languages?: string (comma-joined, e.g. "es, en"), guideType?: string }`                           | `guideLanguages` (list), `guideType`              |
| `includesJson`     | `string[]`                                                                                           | `tourIncludes` (one per line)                     |
| `excludesJson`     | `string[]`                                                                                           | `tourExcludes` (one per line)                     |
| `pickupJson`       | `{ defaultArea?: string, instructions?: string }`                                                    | `pickupDefaultArea`, `pickupInstructions`         |

Notes:

- `guideJson.languages` is a **comma-joined string**, not an array (form joins with `", "`).
- `objectFromFields` drops empty values; a fully-empty object persists as `null`.
- `TourSlotProfile.meetingPointOverrideJson` follows the `meetingPointJson` shape.
- **Legacy `itineraryJson`** rows may be plain `string[]` (pre-normalization). Readers must
  handle both shapes; the Fase 1 backfill (`2026-08-17_tour_content_backfill.sql`) derives
  `includesJson` from either shape and fills `durationMinutes` from `duration` text.

## Shared spine (reuse)

`Product` → `Variant` → `RatePlan` → `DailyInventory` → `Hold` → `Booking` / `BookingRoomDetail` remains the commercial spine for hotels and tours.

## TourSlotProfile (Fase 2)

One profile per `Variant(kind=tour_slot)`. Convention: **1 Variant per clock time**
(e.g. “Salida 09:00”, “Salida 14:00”). `DailyInventory.date` stays date-only; the hour
lives on the profile (Airbnb schedule instance / Viator timedEntry ≈ variant+profile).

| Column                      | Role                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `TourSlotProfile.variantId` | PK = `Variant` with `kind=tour_slot` (1:1)                                                                                    |
| `departureTime`             | Clock time (HH:MM) NOT NULL; not encoded in `DailyInventory.date`                                                             |
| `durationMinutes`           | Optional override of `Tour.durationMinutes` for this salida                                                                   |
| `maxPax`                    | Cupo; seeds `VariantInventoryConfig.defaultTotalUnits` and `VariantCapacity.maxOccupancy` (default inventory = maxPax, not 1) |
| `languageCode`              | Language for this salida                                                                                                      |
| `bookingMode`               | `shared` \| `private` (DEFAULT `shared`)                                                                                      |
| `meetingPointOverrideJson`  | Optional override vs product meeting point                                                                                    |
| `isActive`                  | Profile-level active flag (synced to `Variant.isActive` on save)                                                              |

UI: provider **Salidas** at `/product/{id}/departures` (not hotel rooms). Product hub
exposes CTAs Tarifas + Calendario for tours. Readiness for a sellable salida requires
**profile + capacity + default rate**.

Close-out migration: `db/migrations/2026-08-18_tour_slot_profile_closeout.sql`.

## Guest booking (Fase 3)

- Stay window: `tourDepartureToStay(departure)` → 1-day grid (`checkIn`/`checkOut`).
- PDP labels: salida / participantes.
- Flow: searchOffers → hold → confirm; reserved inventory increases (cupo baja).
- On confirm, `Booking.guestContactSnapshotJson.meetingPoint` captures the slot-level
  meeting-point override when present, otherwise the tour-level point. This preserves
  guest-facing instructions without introducing a tours-only booking table.

## Tickets, cancel hours, voucher (Fase 4)

| Table / column                          | Role                                                                                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TourTicketType`                        | Age bands per product (`adult`/`child`/`infant`/`custom`); MVP pricing via occupancy adult/child. **Custom** inherits the configured pricing bucket (default adult, or age-based from `minAge`) until ticket-specific rates exist. Cupo MVP = 1 inventory unit per ticket. |
| `CancellationTier.hoursBeforeDeparture` | When set, prevails over `daysBeforeArrival` for cancel cutoff                                                                                                                                                                                                              |
| `BookingVoucher`                        | Issued on tour booking confirm (`issued` → `redeemed`/`void`)                                                                                                                                                                                                              |
| `Booking.checkedInAt`                   | Day-of: participantes presentados; redeem voucher via `/api/booking/check-in`                                                                                                                                                                                              |

## Discovery (Fase 5)

| Table                 | Role                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `ProductCategory`     | Persisted taxonomy (Trekking, City Tour, …) by `vertical`                                                |
| `ProductCategoryLink` | Product ↔ category                                                                                       |
| `ProductReview`       | Trust / rating for sort `rating_desc` (public = `published` only); verified via `bookingId` + attendance |
| `MarketplaceEvent`    | Cross-sell impressions/clicks/attributed bookings                                                        |
| `TourPrivateRequest`  | Private salida quote requests (no hold until provider accepts)                                           |
| Indexes               | `Tour.durationMinutes`, `Tour.difficultyLevel`, category/review indexes                                  |

Search `/buscar/tours` requires `startDate` and reads sellable `tour_slot` rows from `SearchUnitView` via `getTourSearchSurface` (min available price, published ratings, applicable salida). Category/duration/difficulty stay query-backed; `priceMin`/`priceMax` apply after the materialized from-price. Categories are edited only on `/product/[id]/tickets` (`ProductCategoryLink`).

## Ops clarity (Fase 6)

| App alias / surface        | Physical truth                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `BookingLineItem`          | `BookingRoomDetail` (drizzle export alias; **no** table rename)                                          |
| Ops vocab by `productType` | `verticalVocabulary.ops` — llegada→salida, habitación→línea, huésped→participante for tours              |
| Booking lifecycle labels   | `deriveBookingLifecycle({ productType })`                                                                |
| Admin quality queue        | `/admin/tours/quality` — score from images, itinerary, meeting point, duration, includes, active salidas |
| `Translation`              | Deprecated / unused — keep table, do not build on it                                                     |

## Base PostgreSQL de pruebas + migraciones de tours (08-19 / 08-20)

Las suites con PostgreSQL requieren `DATABASE_URL_TEST` y
`FASTT_TEST_DATABASE=1`. Vitest elimina las URLs operativas heredadas y rechaza
una URL de pruebas que apunte a la misma base. La configuración y la operación
local están documentadas en [test-database-isolation.md](./test-database-isolation.md).

Los comandos de migración siguen requiriendo una URL operativa explícita; no se
ejecutan como parte de Vitest.

Apply (tracked in `fastt_schema_migrations`; re-run is a no-op when checksum matches):

```bash
pnpm db:migrate:apply-one --file db/migrations/2026-08-19_tour_category_link_backfill.sql
pnpm db:migrate:apply-one --file db/migrations/2026-08-20_tour_p2_trust_quality_private.sql
```

Idempotency validation (applies SQL twice inside a rolled-back transaction):

```bash
pnpm db:validate:tour-p2-trust
```

Rollback (manual; not wired into `apply-one`):

- **08-19**: delete backfill links only if you tracked them; otherwise leave `ProductCategoryLink` rows. `TourCategoryBackfillUnmapped` is a one-off reconciliation artifact and is retired by `2026-09-11_retire_historical_backfill_artifacts.sql`; do not remove migration ledger rows to re-run historical backfills.
- **08-20**:
  ```sql
  DROP TABLE IF EXISTS "TourPrivateRequest";
  DROP TABLE IF EXISTS "MarketplaceEvent";
  DROP INDEX IF EXISTS "ProductReview_bookingId_unique";
  DROP INDEX IF EXISTS "ProductReview_bookingId_idx";
  ALTER TABLE "ProductReview" DROP COLUMN IF EXISTS "bookingId";
  -- restore prior ProductReview.status default only if you changed it intentionally
  DELETE FROM "fastt_schema_migrations" WHERE "id" = '2026-08-20_tour_p2_trust_quality_private';
  ```

## Verification matrix (Fase 6) — Closed only with green, exact proof

**Rule:** mark **Closed** only after a green, reproducible Vitest run that exercises the claim. A `readFileSync` / `toContain` guardrail is **not** runtime proof and must not close a commerce/auth/discovery gap.

**Reproduce:**

```bash
pnpm test:tours:phase6
```

**Last green evidence (local):** re-run `pnpm test:tours:phase6` after changes; includes canary suite (`tour-rollout-canary.test.ts`).

Status legend:

| Status           | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| Closed (runtime) | Postgres/API or policy engine path ran green; link is the exact `it(...)`      |
| Closed (unit)    | Behavioral Vitest without DB; still executable proof, not a static string scan |
| Guardrail        | Source/doc contract via `readFileSync`/`toContain` — architecture only         |

### Runtime gaps (DB / API / policy engine)

| Gap                                                                                                      | Exact proof (`file` → `it`)                                                                                                                                                                                                                                                                                             | Status           |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Tour commerce E2E (search → hold → confirm, cupo per salida)                                             | [`tour-booking-e2e.test.ts`](../../tests/integration/tour-booking-e2e.test.ts) → `runs real search → hold → confirm with independent cupo per salida`                                                                                                                                                                   | Closed (runtime) |
| Cancellation / refund hours (`hoursBeforeDeparture` zoned cutoff)                                        | [`cancellation-hours-deadline.test.ts`](../../tests/policies/cancellation-hours-deadline.test.ts) → `computes hour deadlines as zoned wall clock from departureTime`; `keeps preview / hold snapshot / refund quote aligned for hour policy`; `falls back to daysBeforeArrival midnight deadline when hours are absent` | Closed (runtime) |
| Voucher + check-in + guest/provider auth matrix (Tour-only)                                              | [`tour-check-in-and-guest-trip.test.ts`](../../tests/integration/tour-check-in-and-guest-trip.test.ts) → `authorizes trip/check-in matrix and refuses non-Tour mutation`                                                                                                                                                | Closed (runtime) |
| Discovery filters (published only, active categories, one salida/variant, price/limit after aggregation) | [`tour-discovery-filters.test.ts`](../../tests/integration/tour-discovery-filters.test.ts) → `filters by category/level/price, publishes only, and preserves price matches under limit`                                                                                                                                 | Closed (runtime) |
| Publish readiness / quality floors (4 fotos block; 5+ pasos/includes/categoría/tickets/salida → ready)   | [`vertical-maturity.test.ts`](../../tests/integration/vertical-maturity.test.ts) → `marks Tour ready only when quality floors and sellable schedule are met`                                                                                                                                                            | Closed (runtime) |
| Private request accept transition (auth + idempotency + persist)                                         | [`tour-p2-runtime-trust.test.ts`](../../tests/integration/tour-p2-runtime-trust.test.ts) → `closes private-request accept transition with auth + idempotency`                                                                                                                                                           | Closed (runtime) |
| Verified review → published moderation (auth + idempotency + persist)                                    | [`tour-p2-runtime-trust.test.ts`](../../tests/integration/tour-p2-runtime-trust.test.ts) → `closes verified review → published moderation with auth + idempotency`                                                                                                                                                      | Closed (runtime) |
| Cross-sell impression/click + `booking_attributed`                                                       | [`tour-p2-runtime-trust.test.ts`](../../tests/integration/tour-p2-runtime-trust.test.ts) → `records cross-sell impression/click and closes booking_attributed`                                                                                                                                                          | Closed (runtime) |
| Cancel → voucher void (auth negativa + cancel idempotente)                                               | [`tour-p2-runtime-trust.test.ts`](../../tests/integration/tour-p2-runtime-trust.test.ts) → `voids tour voucher on cancel (happy path + auth negative + idempotent cancel state)`                                                                                                                                        | Closed (runtime) |

Tour content JSON shapes (same maturity suite, not the quality-floor claim):

| Gap                                                  | Exact proof                                                                                                                                                    | Status           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Tour meeting/itinerary/safety/guide JSON persistence | [`vertical-maturity.test.ts`](../../tests/integration/vertical-maturity.test.ts) → `stores Tour meeting point, itinerary, safety and guide as structured JSON` | Closed (runtime) |

### Unit / process proof (executable; not static scans)

| Gap                                                                  | Exact proof                                                                                                                                                                                                                                                                                                                                           | Status        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Tour kill-switches env-only (defaults false; guest override ignored) | [`tour-feature-flags.test.ts`](../../tests/catalog/tour-feature-flags.test.ts) → `defaults tour kill-switches to false (opt-in via env)`; `ignores guest header/query overrides when env has the flag off`; `allows env (and context.env) to enable kill-switches`; `strips hoursBeforeDeparture when TOURS_REFUND_HOURS_ENABLED is off`              | Closed (unit) |
| Rollout ratios + baseline alerts + health endpoint                   | [`tour-rollout-observability.test.ts`](../../tests/catalog/tour-rollout-observability.test.ts) → `computes hold→confirm, redeem/issued, refund quote vs applied ratios`; `fires baseline alerts when ratios drop below thresholds with enough sample`; `exposes ratios and alerts on tours-rollout endpoint`                                          | Closed (unit) |
| Canary release gates (staging / allowlist / % / expansion)           | [`tour-rollout-canary.test.ts`](../../tests/catalog/tour-rollout-canary.test.ts) → `staging stage only enables on staging deployment/host`; `allowlist stage gates checkout by provider and keeps search open`; `percentage stage uses stable bucket and always includes allowlist`; `blocks expansion when hold→confirm or redeem baselines regress` | Closed (unit) |
| Ops vocabulary + quality score helpers (alias/readiness wiring)      | [`tour-ops-admin-quality.test.ts`](../../tests/catalog/tour-ops-admin-quality.test.ts) → `uses tour ops vocabulary for lifecycle and finance labels`; `scores tour admin quality and wires the queue surface`                                                                                                                                         | Closed (unit) |

### Guardrails only (do **not** treat as runtime Closed)

| Contract                                                                              | Exact proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Public search/PDP copy + this taxonomy mapping doc                                    | [`tour-public-surfaces.test.ts`](../../tests/guardrails/tour-public-surfaces.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                      | Guardrail                                    |
| P3 tables deferred (no Guide / TourGuideAssignment / TourDepartureInstance in schema) | [`tour-p3-deferred-capabilities.test.ts`](../../tests/guardrails/tour-p3-deferred-capabilities.test.ts)                                                                                                                                                                                                                                                                                                                                                                                    | Guardrail                                    |
| `BookingLineItem` alias without physical rename                                       | [`tour-ops-admin-quality.test.ts`](../../tests/catalog/tour-ops-admin-quality.test.ts) → `aliases BookingLineItem to BookingRoomDetail without physical rename`                                                                                                                                                                                                                                                                                                                            | Guardrail                                    |
| Schema / semantics contracts (outside phase6 command unless added)                    | [`tour-tickets-discovery.test.ts`](../../tests/catalog/tour-tickets-discovery.test.ts), [`tour-semantics.test.ts`](../../tests/catalog/tour-semantics.test.ts), [`tour-slot-profile.test.ts`](../../tests/catalog/tour-slot-profile.test.ts), [`tour-ticket-occupancy.test.ts`](../../tests/catalog/tour-ticket-occupancy.test.ts), [`tour-search-surface.test.ts`](../../tests/catalog/tour-search-surface.test.ts), [`tour-p2-trust.test.ts`](../../tests/catalog/tour-p2-trust.test.ts) | Guardrail / unit (not phase6 runtime matrix) |

`pnpm test:tours:phase6` file list (must stay in sync with the Closed rows above):

1. `tests/integration/tour-booking-e2e.test.ts`
2. `tests/policies/cancellation-hours-deadline.test.ts`
3. `tests/integration/tour-check-in-and-guest-trip.test.ts`
4. `tests/integration/tour-discovery-filters.test.ts`
5. `tests/integration/tour-p2-runtime-trust.test.ts`
6. `tests/integration/vertical-maturity.test.ts`
7. `tests/catalog/tour-ops-admin-quality.test.ts`
8. `tests/catalog/tour-feature-flags.test.ts`
9. `tests/catalog/tour-rollout-observability.test.ts`
10. `tests/catalog/tour-rollout-canary.test.ts`
11. `tests/guardrails/tour-public-surfaces.test.ts`
12. `tests/guardrails/tour-p3-deferred-capabilities.test.ts`

### Rollout feature flags + observability

Kill-switches default **off** (opt-in via env only). Guest `x-flag-*` / query overrides are ignored for `TOURS_*`. Source: `src/config/featureFlags.ts`.

| Flag                          | Affects                                                     | Observe                                                      |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `TOURS_CHECKOUT_ENABLED`      | hold + confirm for `tour_slot`                              | `tours_hold_total`, `tours_confirm_total`                    |
| `TOURS_REFUND_HOURS_ENABLED`  | hour-based cancel deadlines in policy calculation snapshots | refund quote discrepancies vs day cutoffs                    |
| `TOURS_CHECKIN_ENABLED`       | `/api/booking/check-in`                                     | `tours_checkin_total`, `tours_voucher_total{event=redeemed}` |
| `TOURS_PUBLIC_SEARCH_ENABLED` | `getTourSearchSurface` / `/buscar/tours`                    | `tours_search_total`                                         |

Deploy checkout / refunds / permissions behind these flags. After flip, watch hold failures (`outcome=not_holdable|failure`), confirm conversion (`tours_confirm_total`), voucher redeem/void, and refund amount mismatches when hours flag is toggled.

#### Rollout dashboards / alerts

| Surface                                            | Purpose                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/internal/observability/tours-rollout`    | JSON ratios + failures-by-reason + alert evaluation vs baselines |
| `GET /api/internal/observability/prometheus`       | Exposes `tours_rollout_*` gauges + `tours_*_failures_by_reason`  |
| `/admin/tours/rollout`                             | Internal admin dashboard for the same health snapshot            |
| `tests/catalog/tour-rollout-observability.test.ts` | Ratios, baseline alerts, endpoint contract                       |

Baseline env knobs (defaults in `getTourRolloutThresholds`): `TOURS_ROLLOUT_MIN_HOLD_CONFIRM_RATE`, `TOURS_ROLLOUT_MAX_HOLD_FAILURE_RATE`, `TOURS_ROLLOUT_MIN_REDEEM_ISSUED_RATE`, `TOURS_ROLLOUT_MAX_REFUND_QUOTE_GAP_RATE`, `TOURS_ROLLOUT_MIN_SAMPLE_SIZE`.

Recommended Prometheus alerts: hold→confirm below baseline; hold failure rate high; redeem/issued below baseline; refund quote→applied gap; `tours_rollout_alert_firing > 0` for 15m; `tours_rollout_metrics_collection_error = 1`.

### Release canary (staging → allowlist → percentage → general)

Runbook: [`tours-rollout-canary.md`](./tours-rollout-canary.md).

| Step       | Env                                                              | Observation before expand                                                                   |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Staging    | `TOURS_*_ENABLED=true` + `TOURS_ROLLOUT_STAGE=staging`           | Preview/staging only; `/api/internal/observability/tours-rollout` `canary.expansion.expand` |
| Allowlist  | `TOURS_ROLLOUT_STAGE=allowlist` + `TOURS_PROVIDER_ALLOWLIST`     | No hold-failure / conversion / redeem / refund-gap alerts for the window                    |
| Percentage | `TOURS_ROLLOUT_STAGE=percentage` + raise `TOURS_ROLLOUT_PERCENT` | Same gates; keep expand=true across peak traffic                                            |
| General    | `TOURS_ROLLOUT_STAGE=general` (or unset stage with flags on)     | Full traffic; keep scrape alerts armed                                                      |

Exact proof: [`tour-rollout-canary.test.ts`](../../tests/catalog/tour-rollout-canary.test.ts) → staging host gate; allowlist provider gate; percentage bucket; expansion blocked on baseline regression.

## P3 — Deferred by volume (ADR-gated)

Do **not** add these tables until the matching ADR is `accepted` with metrics +
incident evidence. Process: [`docs/engineering/adr/README.md`](./adr/README.md).

| Capability                     | Tables                                                                           | ADR                                                        | Until then use                                   |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Guide roster / assignment      | `Guide`, `TourGuideAssignment`                                                   | [0002](./adr/0002-tour-guide-assignment.md) (`deferred`)   | `Tour.guideJson` guest copy                      |
| Date-specific salida overrides | `TourDepartureInstance` (`variantId`+`date` only; never replaces DailyInventory) | [0003](./adr/0003-tour-departure-instance.md) (`deferred`) | Close inventory / extra Variant                  |
| Viator / channel sync          | Connector mappings → existing spine                                              | [0004](./adr/0004-viator-channel-sync.md) (`deferred`)     | Local options, tickets, policies, vouchers first |

Policy umbrella: [ADR 0001](./adr/0001-deferred-tour-p3-capabilities.md).

## Do not

- Encode clock time inside `DailyInventory.date`
- Drop `VariantRoom*` (hotel-only, still required)
- Create a parallel Experiences booking schema
- Rename physical columns (`checkInDate`, `BookingRoomDetail`, `pricePerNight`) until financial/booking cost justifies it
- Introduce `Guide` / `TourGuideAssignment` / `TourDepartureInstance` without an accepted ADR + evidence
- Build Viator/channel bookings outside Hold → Booking → BookingVoucher
