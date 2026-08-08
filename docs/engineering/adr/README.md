# Architecture Decision Records — Tours / Experiences

ADRs in this folder gate **schema expansions** for the tour vertical.

## When an ADR is mandatory

Any new physical table (or parallel booking path) for tours requires an ADR **before**
migration + drizzle schema land. This includes, at minimum:

| Capability | Proposed tables | ADR |
| ---------- | --------------- | --- |
| Guide roster / assignment | `Guide`, `TourGuideAssignment` | [0002](./0002-tour-guide-assignment.md) |
| Date-level salida overrides | `TourDepartureInstance` | [0003](./0003-tour-departure-instance.md) |
| Viator / channel sync | Channel mapping + sync runs (no parallel bookings) | [0004](./0004-viator-channel-sync.md) |

Umbrella deferral policy: [0001](./0001-deferred-tour-p3-capabilities.md).

## Required sections (every ADR)

1. **Status** — `deferred` | `proposed` | `accepted` | `superseded` | `rejected`
2. **Context** — problem and current spine workaround
3. **Decision** — what we will / will not build
4. **Evidence gate** — metrics + incident links that must exist before `accepted`
5. **Schema sketch** — only when status ≥ `proposed`; must name FKs to existing spine
6. **Non-goals** — what remains out of scope
7. **Consequences** — ops, search, booking, materialization impact

## Evidence gate (hard requirement)

Before moving an ADR from `deferred`/`proposed` → `accepted`, attach:

| Evidence | Minimum bar |
| -------- | ------------ |
| Volume metric | Named query or dashboard: count of affected bookings/products over ≥30 days |
| Incident / ops pain | At least one PagerDuty/Linear/issue ID **or** written ops incident with date + owner |
| Cost of status quo | Why Variant / JSON / DailyInventory workarounds fail at that volume |
| Owner | Named product + eng owner for the rollout |

Without all four, status must stay `deferred` or `proposed`. CI guardrail
`tests/guardrails/tour-p3-deferred-capabilities.test.ts` blocks premature tables.

## Process

1. File or update the ADR; keep status `deferred` until evidence exists.
2. Collect metrics + incident evidence; link them in the ADR.
3. Design review: confirm mapping onto Product → Variant/`tour_slot` → RatePlan →
   DailyInventory → Hold → Booking (no parallel booking engine).
4. Set status `accepted`, then open the migration PR that references the ADR path.
