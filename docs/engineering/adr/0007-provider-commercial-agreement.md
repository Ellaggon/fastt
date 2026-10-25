Status: proposed
Document type: decision
Owner: Finance / Provider Experience / Engineering
Last verified: 2026-10-25
Scope: Decide whether Tours needs a versioned provider commercial agreement without creating a parallel booking or payment path
Source of truth: `docs/domains/tours/commercial-terms.md` and the existing Provider → Hold → Booking spine
Related code/tests: `src/lib/verification/commercial-lines.ts`, `src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts`, `tests/integration/tour-booking-e2e.test.ts`
Review trigger: Complete the evidence gate and obtain a recorded Finance, Tours Operations and Engineering decision

# ADR 0007 — Provider commercial agreement

## Status

Proposed only. The implementation may be reviewed in an unmerged draft PR, but this ADR does not authorize merging or applying its migration, rollout, policy activation or money movement. No 30-day volume metric, dated operations incident or named decision owner was supplied for this proposal.

## Context

The Tours commercial-terms contract describes an agreement by provider, line, version and effective period. `ProviderCommercialLine` records the provider's declared collection model, but it does not preserve offered terms, the reviewed signer, acceptance of an exact version or an agreement reference on the booking snapshot. The existing booking spine remains Product → Variant → RatePlan → DailyInventory → Hold → Booking.

The decision is whether the agreement lifecycle needs durable, immutable persistence before the product relies on it to authorize publication or booking. An account role alone must not be treated as legal authority to accept terms. A provider agreement is also distinct from the general commercial policy approvals and does not, by itself, authorize Fastt to collect, hold, refund or settle money.

## Decision (proposed)

Evaluate a provider-scoped, Tours-line agreement with immutable versions and explicit request, offer, acceptance and withdrawal states. If accepted, the exact accepted version should be referenced in the hold and booking snapshot while continuing to use the existing inventory and booking spine. The signer must be identified and reviewed before an offer is issued; acceptance must match the offered terms version.

This draft PR is for reviewing the proposed contract and candidate implementation only. Do not merge or apply the schema, roll it out, or activate policy enforcement until the evidence gate below is complete and the decision is formally accepted. Any eventual acceptance must keep agreement approval separate from general policy ratification and from live-money capability.

## Evidence gate

All evidence is currently outstanding. Before changing this ADR to `accepted`, record:

| Evidence | Required entry |
| --- | --- |
| Volume | A query or dashboard with the number of affected Tours providers/bookings over at least 30 days, the observation window and the owner of the measurement. |
| Incident | A dated operations incident or ticket demonstrating material risk or failure caused by the absence of versioned terms and acceptance evidence. |
| Status quo failure | Why `ProviderCommercialLine` plus the current booking snapshot cannot satisfy the contract, audit and dispute requirements without versioned agreement persistence. |
| Owner | Named Finance decision owner and Tours Operations / Engineering rollout DRI. |

Do not substitute a projected launch, a test fixture, or the existence of this implementation proposal for measured volume or an incident. If the evidence does not justify a new table, retain the current schema and revise the product contract instead.

## Schema sketch

If accepted, a candidate `ProviderCommercialAgreement` table would hold one version per provider and line, with request/offer/acceptance metadata, immutable terms and hashes, reviewed signer and representation reference, and an optional link to the related compliance case. Candidate foreign keys are:

- `providerId` → `Provider.id`.
- `requestedByUserId`, `offeredByUserId`, `acceptedByUserId` and `authorizedSignerUserId` → `User.id`.
- `caseId` → `ComplianceCase.id`.
- `Hold` and `Booking` continue to use the existing booking spine; any agreement reference or terms snapshot must be additive and must not create a parallel reservation path.

The exact status constraints, uniqueness rules, immutability boundary, RLS policy and booking snapshot shape require review with the evidence and must be finalized before acceptance.

## Non-goals

- Enabling live collection, custody, refunds, commission charging or payouts.
- Treating provider owner/admin roles as proof of legal signing authority.
- Replacing general commercial-policy approvals or compliance requirements.
- Introducing a Tours-specific booking or inventory path.

## Consequences if accepted

- A later implementation proposal must include an incremental migration, canonical Drizzle schema, authorization and immutability tests, and hold/booking snapshot coverage.
- Publication and booking gates may consume an accepted agreement version only after policy and operational review; an offer or request is not acceptance.
- A revised agreement creates a new version and cannot rewrite the terms attached to historical bookings.
- The feature remains unavailable for live-money execution unless its separate approvals and infrastructure gates are satisfied.
