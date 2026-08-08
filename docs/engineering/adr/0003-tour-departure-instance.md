# ADR 0003 — TourDepartureInstance (date overrides)

- **Status:** deferred
- **Date:** 2026-08-07
- **Depends on:** [0001](./0001-deferred-tour-p3-capabilities.md)

## Context

A `Variant` (`kind = tour_slot`) + `TourSlotProfile` models a reusable salida
template (time, language, maxPax, bookingMode). Calendar availability and price
already live on `DailyInventory` / `SearchUnitView` by `(variantId, date, …)`.

Occasional one-off changes (different meeting point one Sunday, cancelled time)
can often be handled by:

- Closing inventory for that date, or
- Creating another Variant when the product option is truly different.

`TourDepartureInstance` is only justified when **frequent date-specific overrides**
would otherwise explode the Variant count.

## Decision (deferred)

**Do not implement** `TourDepartureInstance` until override frequency proves the
Variant model insufficient.

When accepted, the table **must**:

1. Reference **`variantId` + `date`** (composite identity).
2. Hold only overrides (meeting point, departureTime, guide hint, notes, cancel flag).
3. **Not replace** `DailyInventory` for cupo / open-close / units.
4. **Not** become a parallel sellable unit kind (search still keys off Variant + SUV).

Forbidden shapes:

- Instance-as-product (no `productId` without Variant)
- Instance-owned inventory columns that duplicate `DailyInventory`
- Booking FKs that skip `variantId`

## Evidence gate (required before `accepted`)

| Evidence | Entry bar |
| -------- | --------- |
| Volume | Over 30 days: count of date-specific overrides / workarounds ≥ threshold (e.g. ≥ 3 distinct dates/week per product on ≥ K products) that would force new Variants |
| Incident | Ops pain from Variant sprawl or wrong meeting point on a specific date |
| Status quo failure | Why inventory close + second Variant is worse |
| Owner | Catalog + inventory DRI |

Fill before acceptance:

- Metric link / query: _TBD_
- Incident ID: _TBD_
- Owner: _TBD_

## Non-goals

- Replacing `TourSlotProfile` for the template
- Multi-day itinerary instances (use package vertical or multi-night stay window)

## Consequences when accepted

- Materialization may join instance overrides when present for `(variantId, date)`
- Hold/confirm snapshots copy override meeting point when set
- SUV / DailyInventory remain source of sellability
