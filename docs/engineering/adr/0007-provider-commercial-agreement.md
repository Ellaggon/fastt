Status: proposed
Document type: decision
Owner: adm1n (Finance decision, Tours Operations and Engineering rollout)
Last verified: 2026-10-25
Scope: Decide whether Tours needs a versioned provider commercial agreement without creating a parallel booking or payment path
Source of truth: `docs/domains/tours/commercial-terms.md` and the existing Provider → Hold → Booking spine
Related code/tests: `src/modules/financial/commercial-agreement-rollout.ts`, `src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts`, `tests/unit/commercial-agreement-rollout.test.ts`, `tests/unit/commercial-agreement-disabled.test.ts`, `tests/integration/tour-booking-e2e.test.ts`
Review trigger: Complete the evidence gate and obtain a recorded Finance, Tours Operations and Engineering decision

# ADR 0007 — Provider commercial agreement

## Status

Proposed only. The implementation may be reviewed in an unmerged draft PR, but this ADR does not authorize merging or applying its migration, rollout, policy activation or money movement. No 30-day volume metric or dated operations incident was supplied. On 2026-10-25 the project owner authorized reviewing a pre-launch exception and named `adm1n` as the Finance, Tours Operations and Engineering decision/rollout owner. Reviewing the exception is not its final approval.

## Context

The Tours commercial-terms contract describes an agreement by provider, line, version and effective period. `ProviderCommercialLine` records the provider's declared collection model, but it does not preserve offered terms, the reviewed signer, acceptance of an exact version or an agreement reference on the booking snapshot. The existing booking spine remains Product → Variant → RatePlan → DailyInventory → Hold → Booking.

The decision is whether the agreement lifecycle needs durable, immutable persistence before the product relies on it to authorize publication or booking. An account role alone must not be treated as legal authority to accept terms. A provider agreement is also distinct from the general commercial policy approvals and does not, by itself, authorize Fastt to collect, hold, refund or settle money.

## Decision (proposed)

Evaluate a provider-scoped, Tours-line agreement with immutable versions and explicit request, offer, acceptance and withdrawal states. If accepted, the exact accepted version should be referenced in the hold and booking snapshot while continuing to use the existing inventory and booking spine. The signer must be identified and reviewed before an offer is issued; acceptance must match the offered terms version.

This draft PR is for reviewing the proposed contract and candidate implementation only. Do not merge or apply the schema, roll it out, or activate policy enforcement until the evidence gate below is complete and the decision is formally accepted. Any eventual acceptance must keep agreement approval separate from general policy ratification and from live-money capability.

## Evidence gate

The original volume/incident gate remains unmet. Before changing this ADR to `accepted`, record either the original evidence below or explicit final approval of the narrowly scoped pre-launch exception under review:

| Evidence | Required entry |
| --- | --- |
| Volume | A query or dashboard with the number of affected Tours providers/bookings over at least 30 days, the observation window and the owner of the measurement. |
| Incident | A dated operations incident or ticket demonstrating material risk or failure caused by the absence of versioned terms and acceptance evidence. |
| Status quo failure | Why `ProviderCommercialLine` plus the current booking snapshot cannot satisfy the contract, audit and dispute requirements without versioned agreement persistence. |
| Owner | `adm1n`, named by the project owner on 2026-10-25 for Finance, Tours Operations and Engineering rollout. This assignment does not substitute independent commercial-policy approvers or provider signers. |

Do not substitute a projected launch, a test fixture, or the existence of this implementation proposal for measured volume or an incident. If the evidence does not justify a new table, retain the current schema and revise the product contract instead.

## Pre-launch exception review

The project owner reports a pre-launch project without customers. This is a reported context, not a measured 30-day window. No operational incident is claimed. The exception proposed here applies only to ADR 0007, not to deferred guide, departure-instance or channel tables.

The justification is contractual correctness rather than scale: `ProviderCommercialLine` records a collection declaration, while the current booking snapshot records guest pricing and conditions. Neither represents an offered agreement, its reviewed signer, acceptance of an exact immutable version or a separately auditable agreement history. Storing mutable terms in the declaration would conflate declaration and acceptance; storing them only on a booking would not represent the pre-booking offer/acceptance lifecycle. This is a structural finding from the current schema and code, not a claim about observed disputes or legal sufficiency.

The review recommends allowing additive persistence and dark-deployed code only after the project owner explicitly approves the exception. Mandatory controls are:

- Default `FASTT_TOUR_AGREEMENT_MODE=off`: no agreement-table reads, writes or new booking/publication requirement.
- `prepare` requires a nonempty approval reference and an explicit provider allowlist. It exposes agreement workflows without gating sales. Wildcard cohorts are rejected.
- `enforce` applies only to that approved cohort after migrations, real acceptance and certification. Existing holds without an agreement snapshot retain their original terms and normal expiry; historical bookings are never rewritten.
- The environment switch is not a substitute for ADR approval, schema verification or policy ratification. Missing schema in an enabled environment is an operational error, never inferred acceptance.
- Rollback returns to `off`, retains agreement/booking evidence and does not drop tables or alter historical terms.
- No automatic migration, fictional acceptance backfill, money movement or relaxation of independent commercial approvals is authorized.

The repeatable activation and rollback sequence is maintained in [the commercial activation runbook](../../onboarding/phase-4-policy-activation.md#transición-del-acuerdo-versionado). Final exception approval is still outstanding; implementation tests cannot grant it.

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
