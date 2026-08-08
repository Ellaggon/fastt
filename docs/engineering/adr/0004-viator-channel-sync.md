# ADR 0004 — Viator / channel sync

- **Status:** deferred
- **Date:** 2026-08-07
- **Depends on:** [0001](./0001-deferred-tour-p3-capabilities.md)

## Context

External channels (Viator and similar) need option catalogs, age-band tickets,
cancellation policies, and vouchers. Fastt already models these on the local
spine:

| Channel concept | Fastt spine |
| --------------- | ----------- |
| Product / experience | `Product` + `Tour` |
| Option / departure template | `Variant` `tour_slot` + `TourSlotProfile` |
| Tickets / age bands | `TourTicketType` + occupancy pricing |
| Availability | `DailyInventory` → `SearchUnitView` |
| Policies | `Policy*` + booking snapshots |
| Booking + voucher | `Booking` + `BookingVoucher` |

A channel sync that creates **parallel booking tables** would fork finance, ops,
and refunds.

## Decision (deferred)

**Keep Viator / channel sync out of local product scope** until:

1. Local contracts are closed and stable for **options, tickets, policies, and vouchers**.
2. An accepted ADR (this file, updated) defines the mapping onto the **existing**
   spine (reuse `ProviderIntegration*` patterns where possible).

When accepted, sync **must**:

- Map inbound options → Variant/`tour_slot` (+ profile)
- Map tickets → `TourTicketType` / occupancy keys
- Map policies → Policy library + assignments / snapshots
- Map confirmed sales → Hold → Booking → BookingVoucher (or idempotent booking import into the same tables)
- **Not** introduce `ChannelBooking` / Experiences-only booking schemas

## Evidence gate (required before `accepted`)

| Evidence | Entry bar |
| -------- | --------- |
| Contract readiness | Checklist signed: options, tickets, cancel tiers/hours, voucher lifecycle parity with local guest/provider UX |
| Volume | Partner pipeline or committed GMV / booking volume that justifies connector cost |
| Incident | Documented loss from manual channel ops **or** signed partner launch date |
| Owner | Integrations + booking DRI |

Fill before acceptance:

- Contract checklist link: _TBD_
- Metric / partner: _TBD_
- Incident or launch gate: _TBD_
- Owner: _TBD_

## Non-goals (until accepted)

- Local UI that pretends channel inventory is live without SUV materialization
- Dual-write to a second booking store
- Soft-renaming financial columns for channel jargon

## Consequences when accepted

- New connector under provider integration operations (jobs, mappings, sync runs)
- Mapping table(s) keyed to `providerId` + external IDs → Product/Variant/RatePlan
- Bookings remain queryable in the existing provider booking ops queue
