# ADR 0002 — Guide + TourGuideAssignment

- **Status:** accepted
- **Date:** 2026-08-07
- **Depends on:** [0001](./0001-deferred-tour-p3-capabilities.md)

## Context

Providers sometimes need a **roster** of guides (languages, certifications,
availability) and assignment of a guide to a specific salida (variant) or day.
Today `Tour.guideJson` only stores guest-facing copy (`languages`, `guideType`).

## Decision

Implement provider-scoped operational resources and date-level assignments now.
The implementation uses `TourOperationalResource` and `TourResourceAssignment`
instead of a guide-only entity so guides, vehicles and pickup coordinators share
the same audit and conflict contract.

When accepted, the sketch must:

| Table | Role |
| ----- | ---- |
| `TourOperationalResource` | Provider-scoped guide, vehicle or pickup coordinator |
| `TourResourceAssignment` | Links resource → `variantId` + date with role and status |

Constraints:

- Assignment is ops metadata; it **must not** invent a second booking line.
- Availability of the *product* remains `DailyInventory` / `SearchUnitView`.
- Guest PDP may *display* assigned guide only from a snapshot at confirm time.

## Evidence accepted

| Evidence | Entry bar (illustrative — replace with real numbers) |
| -------- | ---------------------------------------------------- |
| Volume | ≥ N tour products with ≥ 2 active guides, **or** ≥ M% of day-of ops tickets are “wrong guide / language” over 30 days |
| Incident | At least one ops incident where missing roster caused a failed salida or refund |
| Status quo failure | Document why `guideJson` + Slack/spreadsheet cannot absorb the load |
| Owner | Ops + eng DRI |

- Decision: Phase 4 scale roadmap, 2026-08-09.
- Owner: Operations + Integrations.

## Non-goals

- Marketplace “book a named guide” as a separate product type
- Replacing `Tour.guideJson` guest copy (can coexist)

## Consequences when accepted

- Provider UI for roster + assignment on salidas
- Optional snapshot of guide on `Booking` / voucher instructions
- No change to hold/confirm pricing spine
