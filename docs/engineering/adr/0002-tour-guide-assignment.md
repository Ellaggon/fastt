# ADR 0002 — Guide + TourGuideAssignment

- **Status:** deferred
- **Date:** 2026-08-07
- **Depends on:** [0001](./0001-deferred-tour-p3-capabilities.md)

## Context

Providers sometimes need a **roster** of guides (languages, certifications,
availability) and assignment of a guide to a specific salida (variant) or day.
Today `Tour.guideJson` only stores guest-facing copy (`languages`, `guideType`).

## Decision (deferred)

**Do not implement** `Guide` or `TourGuideAssignment` until operations require
roster, languages, availability, or per-salida assignment **and** evidence below
is met.

When accepted, the sketch must:

| Table | Role |
| ----- | ---- |
| `Guide` | Provider-scoped person (name, languages[], active, optional userId) |
| `TourGuideAssignment` | Links `guideId` → `variantId` (and optionally `date`) with status |

Constraints:

- Assignment is ops metadata; it **must not** invent a second booking line.
- Availability of the *product* remains `DailyInventory` / `SearchUnitView`.
- Guest PDP may *display* assigned guide only from a snapshot at confirm time.

## Evidence gate (required before `accepted`)

| Evidence | Entry bar (illustrative — replace with real numbers) |
| -------- | ---------------------------------------------------- |
| Volume | ≥ N tour products with ≥ 2 active guides, **or** ≥ M% of day-of ops tickets are “wrong guide / language” over 30 days |
| Incident | At least one ops incident where missing roster caused a failed salida or refund |
| Status quo failure | Document why `guideJson` + Slack/spreadsheet cannot absorb the load |
| Owner | Ops + eng DRI |

Fill before acceptance:

- Metric link / query: _TBD_
- Incident ID: _TBD_
- Owner: _TBD_

## Non-goals

- Marketplace “book a named guide” as a separate product type
- Replacing `Tour.guideJson` guest copy (can coexist)

## Consequences when accepted

- Provider UI for roster + assignment on salidas
- Optional snapshot of guide on `Booking` / voucher instructions
- No change to hold/confirm pricing spine
