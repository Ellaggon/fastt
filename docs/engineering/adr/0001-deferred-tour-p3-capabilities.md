# ADR 0001 — Deferred tour P3 capabilities (by volume)

- **Status:** accepted (policy)
- **Date:** 2026-08-07
- **Owners:** Tours vertical / Catalog platform

## Context

P0–P2 closed the commercial spine for tours on Fastt’s lodging-shaped tables
(Product → Variant/`tour_slot` → RatePlan → DailyInventory → SearchUnitView → Hold →
Booking → BookingVoucher). Several “nice to have” tables (guides, per-date
instances, channel sync) add operational surface without proven volume.

## Decision

Treat the following as **deferred by volume**:

1. `Guide` + `TourGuideAssignment` — see [0002](./0002-tour-guide-assignment.md)
2. `TourDepartureInstance` — see [0003](./0003-tour-departure-instance.md)
3. Viator / external channel sync — see [0004](./0004-viator-channel-sync.md)

**No migrations, drizzle tables, or UI for these capabilities until** the matching
ADR reaches `accepted` with metrics + incident evidence.

Until then:

- Guide languages / type stay on `Tour.guideJson` (content), not a roster.
- Date sellability stays on `DailyInventory` + `SearchUnitView` keyed by
  `variantId` + `date` (+ occupancy).
- Channel work stays out of the local product scope; future sync must map into
  the existing spine (no parallel booking tables).

## Evidence gate (policy)

Every deferred ADR must collect, before acceptance:

| Field | Example |
| ----- | ------- |
| Metric | “≥X% of tour bookings need guide reassignment mid-week” |
| Incident | Ops ticket / incident ID with date |
| Why not Variant/JSON | Concrete failure of current model |
| Owner | DRI for schema + rollout |

## Consequences

- Taxonomy and CI forbid premature `Guide` / `TourGuideAssignment` /
  `TourDepartureInstance` tables.
- Product can still ship guide *content* and private-quote flows without roster
  tables.
- Channel partners are integrated only after local contracts for options,
  tickets, policies, and vouchers are stable.
