# ADR 0005 — Channel content ownership (property / unit / rate)

- **Status:** accepted (ownership contract) · deferred (outbound HTTP content push)
- **Date:** 2026-08-26
- **Related:** house-rules scope (product / variant / rate arrival), [0004](./0004-viator-channel-sync.md)

## Context

Expedia and Booking separate three layers:

| Layer | Guest-facing meaning | Fastt spine |
| ----- | -------------------- | ----------- |
| **Property policies** | Pets, smoking default, quiet hours, check-in/out | `HouseRule` `scope=product` (+ `PolicyAssignment` product `CheckIn`) |
| **Unit attributes** | Smoking preference, rare space exceptions | `HouseRule` `scope=variant` (esp. Smoking) |
| **Rate commercial** | Cancellation, payment, no-show | `PolicyAssignment` `scope=rate_plan` `Cancellation` / `Payment` / `NoShow` |
| **Rate schedule exception** | Sold early/late arrival times | `PolicyAssignment` `scope=rate_plan` `CheckIn` |

Channex integration today only syncs **ARI + entity ID mappings**. There is no
Expedia connector; OTA reach is expected via the channel manager later. Without
a locked ownership map, a future content writer (or UI drift) could push:

- product smoking onto a rate plan,
- cancellation into house rules,
- rate CheckIn as a overwrite of property policies,

and break Channex / Expedia Partner Central layering.

## Decision

1. **Accepted now:** Fastt owns a canonical ownership + projection contract under
   `src/lib/channel-manager/content/`:
   - `channelContentOwnership.ts` — SoT table
   - `channelContentProjection.ts` — pure draft builder
   - `channelContentValidators.ts` — misplaced-field checks
   - `channex/channexContentFieldMap.ts` / `expedia/expediaContentFieldMap.ts` —
     conceptual vocabularies (not live HTTP schemas)
2. **Content adapter port** (`channel-manager-content-adapter.ts`) stays separate
   from the ARI `ChannelManagerAdapter`. Factory returns `null` until content
   push is certified.
3. **Deferred:** outbound Channex/Expedia HTTP for policies/house rules. Do not
   extend ARI methods to carry content payloads.

## Evidence gate (required before enabling HTTP push)

| Evidence | Entry bar |
| -------- | --------- |
| Certification | Channex (or OTA) content endpoints documented + sandbox fixture |
| Mapping parity | Golden projection cases green in CI |
| Owner | Integrations DRI |
| Incident / launch | Partner launch or documented content mismatch risk |

## Non-goals (until HTTP accepted)

- Patching Channex `property` / `room_type` / `rate_plan` content in production
- Direct Expedia Partner Central API
- New `ProviderIntegrationMapping` rows for “policy” without a remote entity model
- Mixing house-rules UI with Cancellation / Payment / NoShow editors

## Consequences

- Guardrails fail CI if ownership coverage gaps or UI/adapters place content on
  the wrong layer
- Future content writers **must** consume `projectChannelContent` drafts
- ARI certification scripts remain unchanged
