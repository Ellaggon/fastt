# Rooms & Rates Table Taxonomy

This document classifies the operational tables used by Rooms & Rates, booking, search,
and policy resolution. It is intentionally small: each table should have one role so the
system does not drift back into duplicate contractual sources.

## Source Of Truth

Source-of-truth tables are the editable contractual or operational inputs. Mutations
should target these tables through their owning domain. Derived tables and snapshots may
read them, but must not replace them as the place where providers define the business rule.

| Table                       | Owner                      | Role                                                                                  |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `Variant`                   | Catalog / Property Content | Sellable room or product variant.                                                     |
| `RatePlan`                  | Rooms & Rates              | Commercial rate attached to a variant.                                                |
| `DailyInventory`            | Inventory                  | Physical daily inventory input.                                                       |
| `CommercialRuleSet`         | Rooms & Rates Pro          | Reusable commercial automation group such as season, event, last-minute or weekend.   |
| `CommercialRule`            | Rooms & Rates Pro          | Atomic price or sellability rule inside a commercial rule set.                        |
| `CommercialRuleApplication` | Rooms & Rates Pro          | Scope/date/channel application of commercial rules to hotel, room, rate or selection. |
| `PolicyGroup`               | Conditions                 | Provider-owned condition group/library item.                                          |
| `Policy`                    | Conditions                 | Versioned condition content and lifecycle.                                            |
| `PolicyAssignment`          | Conditions                 | Active condition assignment to rate, room, hotel or channel scope.                    |
| `PolicyRule`                | Conditions                 | Structured condition rule content.                                                    |
| `PolicyExceptionRule`       | Conditions / Support       | Platform/legal/support exception before final refund or payout calculation.           |
| `PolicyAuditLog`            | Conditions / Governance    | Audit of condition lifecycle, assignment and override changes.                        |
| `TaxFeeDefinition`          | Payments & Finance         | Canonical tax/fee definition visible to booking, search and finance.                  |
| `TaxFeeAssignment`          | Payments & Finance         | Canonical tax/fee assignment to provider, hotel, room, rate or channel scope.         |

## Derived / Read Model

Derived/read-model tables are projections built from source-of-truth tables. They exist
for fast reads, search, calendar rendering or sellability evaluation. If a derived row is
wrong, fix the source table or recompute the projection.

| Table                   | Derived From                                             | Role                                                 |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `EffectiveAvailability` | `DailyInventory`, locks, bookings                        | Daily sellable unit count projection.                |
| `EffectivePricingV2`    | `RatePlan`, `RatePlanOccupancyPolicy`, `CommercialRule*` | Occupancy-aware daily price projection.              |
| `EffectiveRestriction`  | `CommercialRule*`                                        | Daily restriction projection for search/sellability. |
| `SearchUnitView`        | Availability, pricing, restrictions, policy signals      | Search-ready sellability read model.                 |

## Booking Contract And Snapshot

The booking aggregate preserves the sold contract. `Booking` also carries the small set of
persisted front-desk lifecycle fields; its child snapshots remain immutable and must not be
edited to change future behavior.

| Table                   | Captures                                            | Role                                                         |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `Hold`                  | Temporary inventory hold plus policy snapshot       | Pre-booking contract and inventory lock context.             |
| `Booking`               | Provider, stay dates, total, currency and lifecycle | Contract header plus persisted check-in/check-out/no-show.   |
| `BookingRoomDetail`     | Room/rate/occupancy/pricing labels and amounts      | Immutable multi-room line-item snapshot.                     |
| `BookingPolicySnapshot` | One frozen condition per booking/category           | Immutable condition snapshot with booking FK and uniqueness. |
| `BookingTaxFee`         | Tax/fee breakdown at booking time                   | Immutable tax/fee snapshot with booking FK.                  |

## Guardrails

- New provider-facing mutations must target source-of-truth tables only.
- Recompute jobs may write derived/read-model tables.
- Booking and cancellation flows may write snapshot tables.
- Operational booking reads must use `BookingOperationsQueryRepository`; it is a query
  repository, not a database table or another source of truth.
- `Booking.status` is contractual. Check-in, check-out and no-show use
  `Booking.operationalStatus` plus their actor/timestamp fields.
- A booking stores one `totalAmount` in its contractual ISO `currency`; never add
  currency-specific amount columns.
- Do not reintroduce legacy contractual tables when a source already exists.
- `BookingTaxFee` is a booking snapshot. It is not the removed legacy `TaxFee` table.
- `TaxFeeDefinition` and `TaxFeeAssignment` are the only configurable taxes/fees contract.
