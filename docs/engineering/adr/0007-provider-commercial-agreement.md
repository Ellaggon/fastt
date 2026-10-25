Status: accepted
Document type: decision
Owner: adm1n (Finance decision, Tours Operations and Engineering rollout)
Last verified: 2026-10-25
Scope: Approve versioned provider commercial agreements as a pre-launch exception, merged disabled by default without a parallel booking or payment path
Source of truth: `docs/domains/tours/commercial-terms.md` and the existing Provider → Hold → Booking spine
Related code/tests: `src/modules/financial/commercial-agreement-rollout.ts`, `src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts`, `tests/unit/commercial-agreement-rollout.test.ts`, `tests/unit/commercial-agreement-disabled.test.ts`, `tests/integration/tour-booking-e2e.test.ts`
Review trigger: Production migration or activation, first customer launch, ownership change or change to contract/booking scope

# ADR 0007 — Provider commercial agreement

## Status

Accepted with a narrowly scoped pre-launch exception. On 2026-10-25 the project owner explicitly approved the exception in the project conversation ("Yes aprove"), after reviewing the recommendation to merge code disabled by default, and named `adm1n` as the Finance, Tours Operations and Engineering decision/rollout owner. This authorizes integrating the additive implementation with `FASTT_TOUR_AGREEMENT_MODE=off` by default. It does not authorize executing production migrations now, enabling enforcement, accepting agreements on behalf of providers, ratifying commercial policies or moving money. Migration and activation remain separately scheduled operations under the runbook.

## Context

The Tours commercial-terms contract describes an agreement by provider, line, version and effective period. `ProviderCommercialLine` records the provider's declared collection model, but it does not preserve offered terms, the reviewed signer, acceptance of an exact version or an agreement reference on the booking snapshot. The existing booking spine remains Product → Variant → RatePlan → DailyInventory → Hold → Booking.

The decision is whether the agreement lifecycle needs durable, immutable persistence before the product relies on it to authorize publication or booking. An account role alone must not be treated as legal authority to accept terms. A provider agreement is also distinct from the general commercial policy approvals and does not, by itself, authorize Fastt to collect, hold, refund or settle money.

## Decision

Use a provider-scoped, Tours-line agreement with immutable versions and explicit request, offer, acceptance and withdrawal states. When enforcement is enabled for an approved cohort, reference the exact accepted version in the hold and booking snapshot while continuing to use the existing inventory and booking spine. The signer must be identified and reviewed before an offer is issued; acceptance must match the offered terms version.

The approved integration is a dark deployment, not an operational release. Keep agreement approval separate from general policy ratification and from live-money capability. Production schema application, provider preparation and cohort activation must follow the separate runbook gates.

## Evidence gate

The original volume/incident gate remains unmet as an empirical claim. The project owner's explicit approval waives those two prerequisites only for this pre-launch contractual-correctness decision; it does not assert that a metric or incident exists. The structural justification and responsible owner are recorded below. Other deferred Tours capabilities retain the original gate.

| Evidence | Required entry |
| --- | --- |
| Volume | A query or dashboard with the number of affected Tours providers/bookings over at least 30 days, the observation window and the owner of the measurement. |
| Incident | A dated operations incident or ticket demonstrating material risk or failure caused by the absence of versioned terms and acceptance evidence. |
| Status quo failure | Why `ProviderCommercialLine` plus the current booking snapshot cannot satisfy the contract, audit and dispute requirements without versioned agreement persistence. |
| Owner | `adm1n`, named by the project owner on 2026-10-25 for Finance, Tours Operations and Engineering rollout. This assignment does not substitute independent commercial-policy approvers or provider signers. |

Do not substitute a projected launch, test fixture or implementation for measured volume or an incident. This exception must not be cited as empirical evidence or reused to authorize unrelated tables.

## Accepted pre-launch exception

The project owner reports a pre-launch project without customers. This is a reported context, not a measured 30-day window. No operational incident is claimed. The approved exception applies only to ADR 0007, not to deferred guide, departure-instance or channel tables.

The justification is contractual correctness rather than scale: `ProviderCommercialLine` records a collection declaration, while the current booking snapshot records guest pricing and conditions. Neither represents an offered agreement, its reviewed signer, acceptance of an exact immutable version or a separately auditable agreement history. Storing mutable terms in the declaration would conflate declaration and acceptance; storing them only on a booking would not represent the pre-booking offer/acceptance lifecycle. This is a structural finding from the current schema and code, not a claim about observed disputes or legal sufficiency.

The approved exception allows additive persistence definitions and dark-deployed code. Mandatory controls are:

- Default `FASTT_TOUR_AGREEMENT_MODE=off`: no agreement-table reads, writes or new booking/publication requirement.
- `prepare` requires a nonempty approval reference and an explicit provider allowlist. It exposes agreement workflows without gating sales. Wildcard cohorts are rejected.
- `enforce` applies only to that approved cohort after migrations, real acceptance and certification. Existing holds without an agreement snapshot retain their original terms and normal expiry; historical bookings are never rewritten.
- The environment switch is not a substitute for ADR approval, schema verification or policy ratification. Missing schema in an enabled environment is an operational error, never inferred acceptance.
- Rollback returns to `off`, retains agreement/booking evidence and does not drop tables or alter historical terms.
- No automatic migration, fictional acceptance backfill, money movement or relaxation of independent commercial approvals is authorized.

The repeatable activation and rollback sequence is maintained in [the commercial activation runbook](../../onboarding/phase-4-policy-activation.md#transición-del-acuerdo-versionado). The project owner's approval establishes this decision; implementation tests establish only the technical behavior exercised in their stated environment.

## Schema sketch

`ProviderCommercialAgreement` holds one version per provider and line, with request/offer/acceptance metadata, immutable terms and hashes, reviewed signer and representation reference, and an optional link to the related compliance case. Foreign keys are:

- `providerId` → `Provider.id`.
- `requestedByUserId`, `offeredByUserId`, `acceptedByUserId` and `authorizedSignerUserId` → `User.id`.
- `caseId` → `ComplianceCase.id`.
- `Hold` and `Booking` continue to use the existing booking spine; any agreement reference or terms snapshot must be additive and must not create a parallel reservation path.

The canonical Drizzle schema and incremental migrations define status/acceptance constraints, unique version and pending-proposal indexes, an immutability trigger and RLS. Their isolated PostgreSQL tests do not certify a production deployment; verify these controls again on the target database before enabling `prepare`.

## Non-goals

- Enabling live collection, custody, refunds, commission charging or payouts.
- Treating provider owner/admin roles as proof of legal signing authority.
- Replacing general commercial-policy approvals or compliance requirements.
- Introducing a Tours-specific booking or inventory path.

## Consequences

- The implementation includes incremental migrations, canonical Drizzle schema, authorization and immutability tests, and hold/booking snapshot coverage. Production application remains a separate operation.
- Publication and booking gates may consume an accepted agreement version only after policy and operational review; an offer or request is not acceptance.
- A revised agreement creates a new version and cannot rewrite the terms attached to historical bookings.
- The feature remains unavailable for live-money execution unless its separate approvals and infrastructure gates are satisfied.
