# Tour Vertical Table Taxonomy

Sibling of [`rooms-rates-table-taxonomy.md`](./rooms-rates-table-taxonomy.md).
Defines how lodging-shaped columns map to tours/experiences without a second booking engine.

## Semantic mapping (source of truth)

| Physical column / table | Tour meaning |
| ----------------------- | ------------ |
| `Variant` with `kind = tour_slot` | Product option / salida (Viator option, Airbnb schedule template) |
| `DailyInventory.date` | Departure calendar date |
| `Booking.checkInDate` | `departureDate` |
| `Booking.checkOutDate` | End of activity window (`departureDate + 1` for day tours, or multi-day end) |
| `BookingRoomDetail` | Booking line item (not a hotel room) — app alias `BookingLineItem` |
| `SearchUnitView.pricePerNight` | Price per participant / unit |
| `CancellationTier.daysBeforeArrival` | Days before departure (MVP) |
| `VariantCapacity.maxOccupancy` | Max participants (pax) on the salida |

## Tour content columns (Fase 1)

| Column | Role |
| ------ | ---- |
| `Tour.duration` | Display label (legacy free text) |
| `Tour.durationMinutes` | Queryable duration in minutes |
| `Tour.includesJson` / `excludesJson` | Aligned with Package |
| `Tour.categoriesJson` | MVP category tags (string array); join table in later discovery phase |
| `Tour.pickupJson` | Optional pickup logistics (Limousine pattern) |
| `Tour.meetingPointJson` / `itineraryJson` / `safetyJson` / `guideJson` | Existing structured JSON |

## Tour JSON shapes inventory (Fase 0 contract)

Shapes as produced by the provider forms. Create and update paths build identical
payloads (`create-product-subtype.ts` and `api/product/subtype.ts` PUT); `tourSchema`
(`src/schemas/product/subtype.ts`) accepts them as `z.unknown()` — these shapes are
the de-facto contract, pinned by `tests/catalog/tour-semantics.test.ts`.

| Column | Shape | Form fields (source) |
| ------ | ----- | -------------------- |
| `meetingPointJson` | `{ address?: string, instructions?: string }` (object omitted if all empty) | `meetingPointAddress`, `meetingPointInstructions` |
| `itineraryJson` | `Array<{ step: number (1-based), description: string }>` | `tourItinerary` (one line per step) |
| `safetyJson` | `{ requirements?: string, warnings?: string }` | `safetyRequirements`, `safetyWarnings` |
| `guideJson` | `{ languages?: string (comma-joined, e.g. "es, en"), guideType?: string }` | `guideLanguages` (list), `guideType` |
| `includesJson` | `string[]` | `tourIncludes` (one per line) |
| `excludesJson` | `string[]` | `tourExcludes` (one per line) |
| `categoriesJson` | `string[]` (legacy tags; persisted taxonomy is `ProductCategoryLink` since Fase 5) | `tourCategories` |
| `pickupJson` | `{ defaultArea?: string, instructions?: string }` | `pickupDefaultArea`, `pickupInstructions` |

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

| Column | Role |
| ------ | ---- |
| `TourSlotProfile.variantId` | PK = `Variant` with `kind=tour_slot` (1:1) |
| `departureTime` | Clock time (HH:MM) NOT NULL; not encoded in `DailyInventory.date` |
| `durationMinutes` | Optional override of `Tour.durationMinutes` for this salida |
| `maxPax` | Cupo; seeds `VariantInventoryConfig.defaultTotalUnits` and `VariantCapacity.maxOccupancy` (default inventory = maxPax, not 1) |
| `languageCode` | Language for this salida |
| `bookingMode` | `shared` \| `private` (DEFAULT `shared`) |
| `meetingPointOverrideJson` | Optional override vs product meeting point |
| `isActive` | Profile-level active flag (synced to `Variant.isActive` on save) |

UI: provider **Salidas** at `/product/{id}/departures` (not hotel rooms). Product hub
exposes CTAs Tarifas + Calendario for tours. Readiness for a sellable salida requires
**profile + capacity + default rate**.

Close-out migration: `db/migrations/2026-08-18_tour_slot_profile_closeout.sql`.

## Guest booking (Fase 3)

- Stay window: `tourDepartureToStay(departure)` → 1-day grid (`checkIn`/`checkOut`).
- PDP labels: salida / participantes.
- Flow: searchOffers → hold → confirm; reserved inventory increases (cupo baja).

## Tickets, cancel hours, voucher (Fase 4)

| Table / column | Role |
| -------------- | ---- |
| `TourTicketType` | Age bands per product (`adult`/`child`/`infant`/`custom`); MVP pricing via occupancy adult/child |
| `CancellationTier.hoursBeforeDeparture` | When set, prevails over `daysBeforeArrival` for cancel cutoff |
| `BookingVoucher` | Issued on tour booking confirm (`issued` → `redeemed`/`void`) |
| `Booking.checkedInAt` | Day-of: participantes presentados; redeem voucher via `/api/booking/check-in` |

## Discovery (Fase 5)

| Table | Role |
| ----- | ---- |
| `ProductCategory` | Persisted taxonomy (Trekking, City Tour, …) by `vertical` |
| `ProductCategoryLink` | Product ↔ category |
| `ProductReview` | Trust / rating for sort `rating_desc` |
| Indexes | `Tour.durationMinutes`, `Tour.difficultyLevel`, category/review indexes |

Search `/tours/search` filters by category slug, duration, difficulty with persisted rows (not only UI panel lists).

## Ops clarity (Fase 6)

| App alias / surface | Physical truth |
| ------------------- | -------------- |
| `BookingLineItem` | `BookingRoomDetail` (drizzle export alias; **no** table rename) |
| Ops vocab by `productType` | `verticalVocabulary.ops` — llegada→salida, habitación→línea, huésped→participante for tours |
| Booking lifecycle labels | `deriveBookingLifecycle({ productType })` |
| Admin quality queue | `/admin/tours/quality` — score from images, itinerary, meeting point, duration, includes, active salidas |
| `Translation` | Deprecated / unused — keep table, do not build on it |

## Do not

- Encode clock time inside `DailyInventory.date`
- Drop `VariantRoom*` (hotel-only, still required)
- Create a parallel Experiences booking schema
- Rename physical columns (`checkInDate`, `BookingRoomDetail`, `pricePerNight`) until financial/booking cost justifies it
