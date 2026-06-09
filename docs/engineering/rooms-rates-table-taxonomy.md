# Rooms & Rates Table Taxonomy

This document classifies the operational tables used by Rooms & Rates, booking, search,
and policy resolution. It is intentionally small: each table should have one role so the
system does not drift back into duplicate contractual sources.

## Source Of Truth

Source-of-truth tables are the editable contractual or operational inputs. Mutations
should target these tables through their owning domain. Derived tables and snapshots may
read them, but must not replace them as the place where providers define the business rule.

| Table                 | Owner                      | Role                                                                          |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `Variant`             | Catalog / Property Content | Sellable room or product variant.                                             |
| `RatePlan`            | Rooms & Rates              | Commercial rate attached to a variant.                                        |
| `DailyInventory`      | Inventory                  | Physical daily inventory input.                                               |
| `PriceRule`           | Pricing                    | Price modifiers, overrides, seasonality and occupancy-specific pricing rules. |
| `Restriction`         | Rooms & Rates              | Sale rules such as min stay, max stay, CTA/CTD and stop sell.                 |
| `PolicyGroup`         | Conditions                 | Provider-owned condition group/library item.                                  |
| `Policy`              | Conditions                 | Versioned condition content and lifecycle.                                    |
| `PolicyAssignment`    | Conditions                 | Active condition assignment to rate, room, hotel or channel scope.            |
| `PolicyRule`          | Conditions                 | Structured condition rule content.                                            |
| `PolicyExceptionRule` | Conditions / Support       | Platform/legal/support exception before final refund or payout calculation.   |
| `PolicyAuditLog`      | Conditions / Governance    | Audit of condition lifecycle, assignment and override changes.                |
| `TaxFeeDefinition`    | Payments & Finance         | Canonical tax/fee definition visible to booking, search and finance.          |
| `TaxFeeAssignment`    | Payments & Finance         | Canonical tax/fee assignment to provider, hotel, room, rate or channel scope. |

## Derived / Read Model

Derived/read-model tables are projections built from source-of-truth tables. They exist
for fast reads, search, calendar rendering or sellability evaluation. If a derived row is
wrong, fix the source table or recompute the projection.

| Table                   | Derived From                                        | Role                                                 |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `EffectiveAvailability` | `DailyInventory`, locks, bookings                   | Daily sellable unit count projection.                |
| `EffectivePricingV2`    | `RatePlan`, `RatePlanOccupancyPolicy`, `PriceRule`  | Occupancy-aware daily price projection.              |
| `EffectiveRestriction`  | `Restriction`                                       | Daily restriction projection for search/sellability. |
| `SearchUnitView`        | Availability, pricing, restrictions, policy signals | Search-ready sellability read model.                 |

## Snapshot

Snapshot tables are immutable booking or hold records. They preserve the contract that was
shown or applied at a point in time. They are not configuration tables and should not be
edited to change future behavior.

| Table                   | Captures                                       | Role                                             |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `Hold`                  | Temporary inventory hold plus policy snapshot  | Pre-booking contract and inventory lock context. |
| `BookingRoomDetail`     | Room/rate/occupancy/pricing labels and amounts | Booking line-item snapshot.                      |
| `BookingPolicySnapshot` | Policy contract at booking time                | Immutable condition snapshot.                    |
| `BookingTaxFee`         | Tax/fee breakdown at booking time              | Immutable tax/fee snapshot.                      |

## Guardrails

- New provider-facing mutations must target source-of-truth tables only.
- Recompute jobs may write derived/read-model tables.
- Booking and cancellation flows may write snapshot tables.
- Do not reintroduce legacy contractual tables when a source already exists.
- `BookingTaxFee` is a booking snapshot. It is not the removed legacy `TaxFee` table.
- `TaxFeeDefinition` and `TaxFeeAssignment` are the only configurable taxes/fees contract.
