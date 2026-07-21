# Provider Configuration Table Taxonomy

This document classifies the tables that power provider settings, compliance,
fiscal identity, payout readiness, team access, integrations and governance.

It is intentionally small and strict: **each table has one role**. New tables
must not reintroduce dual sources of truth (the failure mode that previously
put fiscal and readiness fields on `ProviderProfile`).

Sibling contract: commercial inventory/pricing tables live in
[`rooms-rates-table-taxonomy.md`](./rooms-rates-table-taxonomy.md). Sales
`TaxFeeDefinition` / `TaxFeeAssignment` appear in both places on purpose —
they are owned by taxes/fees, consumed by booking/search/finance, and must
never be confused with provider taxpayer identity.

External product analogs (for domain language only, not schema copy):

| Concern | Airbnb-style surface | Expedia-style surface | Fastt owner |
| --- | --- | --- | --- |
| Account / ops defaults | Account settings | Partner profile / property admin | `Provider` + `ProviderProfile` |
| Taxpayer / tax registration | Taxes → Taxpayers | Financials → Tax & Registration | `ProviderTaxConfiguration` |
| Occupancy / sales taxes & fees | Listing tax tools / fee settings | Property taxes & fees | `TaxFeeDefinition` + `TaxFeeAssignment` |
| Payout methods | Payments → Payout methods | Financials → Bank / payout | `ProviderPaymentAccount` |
| Team & permissions | Hosting team / co-host permissions | Partner users & roles | `ProviderUser` + `ProviderInvitation` |
| Identity / business docs | Identity & business verification | Onboarding document requests | `ProviderDocument` + `ProviderVerification` |
| Connectivity | Channel / calendar / API tools | Connectivity providers / CRS / CM | `ProviderIntegrationConnection` |

---

## Classification Model

Every configuration-related table belongs to exactly one of these classes:

| Class | Mutability | Purpose | If wrong, fix by… |
| --- | --- | --- | --- |
| **Source of truth** | Provider- or platform-editable inputs | Authoritative place to define a fact | Editing the owning table through its domain API |
| **Derived / read model** | System-written projection | Fast capability / eligibility reads | Recomputing from sources |
| **Audit log** | Append-only mutation history | Who changed what, before/after, risk | Writing via `writeProviderAuditLog` (never hand-editing history) |
| **Operational event log** | Append-only telemetry | Connector sync / delivery traces | Emitting events from integration ops |
| **Snapshot** | Immutable frozen contract at a point in time | Preserve sold or evaluated state | Creating a new snapshot; never mutating old ones |

Do not invent a sixth class for “temporary compatibility columns.” Prefer a
migration that deletes the duplicate.

---

## Source Of Truth

Source-of-truth tables are the editable contractual or operational inputs.
Mutations must target these tables through their owning domain. Derived tables,
audit rows and snapshots may read them, but must not become the place where
providers redefine the fact.

### Identity And Operations

| Table | Owner | Role |
| --- | --- | --- |
| `Provider` | Catalog | Commercial identity: legal name, display name, lifecycle status. |
| `ProviderProfile` | Settings / Ops | Operational defaults only: timezone, default currency, support contacts, professional-tools preference. |

`ProviderProfile` must **not** store fiscal identity, payout readiness or
integration readiness. Those belong to the tables below.

### Fiscal Identity Vs Sales Tax Application

These are two different products. Mixing them recreates the Airbnb mistake of
putting taxpayer forms inside listing tax tools (or the reverse).

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderTaxConfiguration` | Settings / Fiscal | Provider taxpayer / tax-registration identity and fiscal readiness (`status`, residence country, registration number, regime, invoicing mode). |
| `TaxFeeDefinition` | Taxes & Fees | Canonical commercial tax or fee rule applied to sellable prices. |
| `TaxFeeAssignment` | Taxes & Fees | Scope/channel application of a definition to provider, product, variant, rate or global scope. |

**TaxConfiguration status ownership (Airbnb/Expedia-aligned):** the provider may
only produce `not_configured` | `pending` by submitting identity fields.
Transitions to `verified` | `requires_attention` are internal-admin only
(`POST /api/admin/providers/tax-configuration`). Providers never self-certify.

Cross-reference: `TaxFeeDefinition` / `TaxFeeAssignment` are also listed in the
Rooms & Rates taxonomy because booking, search and finance consume them. Their
**write owner** remains taxes/fees, not provider profile.

### Payments

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderPaymentAccount` | Payments | Concrete payout/payment method records and verification status for a provider. |

Multiple accounts per provider are allowed. Readiness is derived from verified
accounts (and optionally rolled into `ProviderFinancialProfile`), never stored
as a boolean on `ProviderProfile`.

**PaymentAccount status ownership (Airbnb/Expedia-aligned):** the provider may
only **submit** payout methods (`POST /api/provider/settings/payment-accounts`);
creates are always `pending`. Transitions to `verified` |
`requires_attention` are internal-admin only
(`POST /api/admin/providers/payment-accounts`). On verify, the rollup
`ProviderFinancialProfile` is updated to `ready`. Providers never self-certify
payout accounts (micro-deposit / admin review is the future verification path).

### Compliance And Verification

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderDocument` | Verification | Submitted compliance artifacts (identity, business registration, tax docs, ownership, licenses, address proof) with review lifecycle. |
| `ProviderVerification` | Verification | Append-only compliance decisions (`pending` / `approved` / `rejected`). Latest row by `createdAt`/`id` is the effective decision. |

Providers may **submit** documents (`POST /api/provider/settings/documents`).
Verify/reject is internal-admin only (`POST /api/admin/providers/documents`),
mirroring Airbnb KYC and Expedia onboarding document review.

`ProviderVerification` is source of truth for the decision stream. It is not a
substitute for `ProviderAuditLog` (which records field-level mutations across
domains).

**Unified internal console (Airbnb Trust & Safety / Expedia partner ops):**
`/admin/providers` is the single ops surface for pending work across
verification, tax configuration, documents and payout accounts, plus a
compliance audit trail (`ProviderAuditLog`). Queue aggregation lives in
`provider-admin-compliance` / `GET /api/admin/providers/compliance`. Dimensional
filters (`all` | `verification` | `fiscal` | `documents` | `payments` | `audit`)
never grant providers review powers.

### Team And Access

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderUser` | Team | Active membership: `role` (`owner` \| `admin` \| `staff`) plus optional `permissionsJson` domain overrides. |
| `ProviderInvitation` | Team | Pending invite lifecycle: email, role, status, invitedBy, expiresAt, acceptedAt. |

Effective permissions are resolved in application code
(`resolveProviderPermissions`). Do not invent a second membership table.

### Integrations

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderIntegrationConnection` | Integrations | Connector configuration: connector key, status, sandbox/production mode, scopes, credentials reference, last sync summary. |

Credentials material must live behind `credentialsRef` (or equivalent vault
pointer), never as plaintext in audit payloads.

---

## Derived / Read Model

Derived/read-model tables are projections. They exist for dashboard readiness,
capability gates and finance ops. If a derived row is wrong, fix the source or
recompute — do not “correct” readiness by editing the projection by hand in
product UI.

| Table | Derived From | Role |
| --- | --- | --- |
| `ProviderConfigurationState` | `evaluateProviderGovernance` over identity, profile, verification, documents, tax config, tax fees, payment accounts, integrations, team | Persisted capability snapshot: publish / bookings / payments / integrations, readiness percent, blockers and risks. |
| `ProviderFinancialProfile` | Payment accounts, tax configuration, finance operations | Aggregated finance eligibility summary consumed by financial workflows. Not the payout method store. Not the taxpayer store. |

Non-table derived signals (computed in governance, not persisted as columns on
`ProviderProfile`):

| Signal | Derived From |
| --- | --- |
| Payment readiness | Verified `ProviderPaymentAccount` only (`ProviderFinancialProfile` is rollup, not a shortcut). Upsert to `ready` requires a verified payout account. |
| Integration readiness | `ProviderIntegrationConnection.status = connected` **and** successful smoke `lastSyncStatus` (`success`/`ok`). Saving credentials yields `pending` until sync test. |
| Fiscal readiness | `ProviderTaxConfiguration.status = verified` only. Active `TaxFeeDefinition` + country is a **risk** if taxpayer is unverified, never `complete`. |
| Documents readiness | Verified minimum KYC set: `government_id` + `business_registration` + `tax_document`. Approved `ProviderVerification` does **not** bypass. |

**Progress surfaces:** `/api/provider/settings/summary` and `/api/internal/provider-summary`
both derive progress from `evaluateProviderGovernance` (8 checks). Do not reintroduce
a 3-step shortcut.

**Payout secrets:** full account/IBAN is stored encrypted (`accountIdentifierEnc` in
`metadataJson`) via `provider-payment-secrets`. Never persist plaintext
`accountIdentifier`. Admin review decrypts in memory only. Generate
`PROVIDER_PAYOUT_SECRETS_KEY` with `openssl rand -base64 48` (operator-owned secret).

**Document storage:** with R2 configured, uploads store `r2:provider-documents/...`
refs; admin opens files via signed preview
(`GET /api/admin/providers/documents/preview`). `local://` is test/local-only.

**Publish gates:** product publish and rate-plan activation both call
`assertProviderCapability("publish")` in addition to inventory/pricing checks.

**Integrations policy (P2-6):** connector smoke success is **optional for
publish/booking**. Missing or pending integrations are `risks` only — they never
block `capabilities.publish`. Integrations gate only the `integrations`
capability surface.

**Payout ownership (P2-1):** admin may initiate a micro-deposit challenge;
provider confirms two amounts → verified. Admin override verify remains allowed.

**Connector smoke (P2-2):** `syncProviderIntegration` marks `connected` only after
`runConnectorSmokeTest` succeeds (`https://` probe, valid `vault://`, or
`test://smoke-ok` harness).

**Taxpayer format (P2-3):** `validateTaxpayerRegistrationNumber` runs on fiscal
upsert and before admin `verified` (CL RUT checksum, BO NIT, US EIN, AR CUIT,
generic otherwise).

**Ops SLA (P2-5):** `ProviderComplianceAssignment` + `/api/admin/providers/compliance-assignments`.

**Governance anti-bypass (Airbnb/Expedia-aligned):** identity verification, taxpayer
validation, document KYC, payout verification and connector smoke tests are
independent gates. Do not collapse them into a single self-serve checkbox or
treat commercial tax-fee tools as taxpayer verification.

---

## Audit Log

Audit logs are append-only histories of **sensitive mutations**. They answer:
who changed what, from which before-state to which after-state, at what risk.

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderAuditLog` | Governance | Provider-scoped mutation audit: `actorUserId`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `riskLevel`, `createdAt`. |

### Audit contract

Sensitive writes in fiscal profile, payments, integrations, team, documents and
operational profile must go through `writeProviderAuditLog`
(`src/lib/provider-audit.ts`) and must include:

1. `actorUserId`
2. `beforeJson` (explicit `null` on creates)
3. `afterJson`
4. `riskLevel` (`low` \| `medium` \| `high`)

Secrets (`credentialsRef`, tokens, passwords) are redacted by
`snapshotForProviderAudit`. Do not bypass the helper to store raw secrets in
audit JSON.

`ProviderAuditLog` is not a source of truth for current configuration. Current
state lives in source tables; audit explains how it got there.

---

## Operational Event Log

Distinct from governance audit: these rows record connector runtime activity.

| Table | Owner | Role |
| --- | --- | --- |
| `ProviderIntegrationSyncLog` | Integrations | Append-only sync/test/revoke/delivery events per connector. |

Use sync logs for ops debugging and UI activity feeds. Use `ProviderAuditLog`
for compliance-grade mutation history. Do not merge the two tables.

---

## Snapshot

Snapshots freeze an evaluated or sold state so later source edits do not rewrite
history. Configuration’s primary snapshot is governance state; booking-time tax
snapshots live with the booking aggregate (see Rooms & Rates taxonomy).

| Table | Captures | Role |
| --- | --- | --- |
| `ProviderConfigurationState` | Latest governance evaluation | Capability / blocker snapshot for settings summary, publish gates and simulations. Treated as derived+snapshot: overwritten on re-evaluate, never manually edited as product truth. |
| `BookingTaxFee` | Tax/fee breakdown at booking time | Immutable sales-tax snapshot on the booking contract. Owned by booking; sourced from `TaxFeeDefinition` / `TaxFeeAssignment` resolution. |

`ProviderConfigurationState` may be classified as both derived and snapshot: it
is recomputed from sources, but consumers may read it as the last known gate
state without re-running full governance.

---

## Domain Ownership Map

| Domain | Write APIs / libs (canonical) | Must not write |
| --- | --- | --- |
| Ops profile | `/api/providers/profile`, `upsertProviderProfileV2` | Tax, payment, integration readiness fields |
| Fiscal identity | `/api/provider/settings/tax-configuration`, `provider-tax-configuration` | `TaxFeeDefinition` / assignments |
| Sales taxes & fees | `/api/provider/tax-fees/*`, taxes-fees module | `ProviderTaxConfiguration` |
| Payout methods | `/api/provider/settings/payment-accounts`, `provider-payment-accounts` (admin review: `/api/admin/providers/payment-accounts`) | Self-verify; readiness flags on `ProviderProfile` |
| Documents | `/api/provider/settings/documents`, `provider-documents` | Verification decision stream except via review actions |
| Compliance ops console | `/admin/providers`, `provider-admin-compliance`, `GET /api/admin/providers/compliance` + review POSTs under `/api/admin/providers/*` | Provider-facing self-certify; editing `ProviderConfigurationState` as settings |
| Team | `/api/provider/settings/invitations`, permissions helpers | Ad-hoc membership tables |
| Integrations | `/api/provider/integrations/*`, `provider-integrations` | Profile readiness flags |
| Governance | `evaluateProviderGovernance`, `writeProviderAuditLog` | Manual edits to `ProviderConfigurationState` as if it were settings UI |

---

## Anti-Patterns (Do Not Reintroduce)

1. **Dual columns for prudence** — e.g. fiscal fields on both `ProviderProfile`
   and `ProviderTaxConfiguration`.
2. **Readiness booleans on ops profile** — payment/integration readiness must
   be derived from their owning tables.
3. **Taxpayer identity inside sales tax tools** — or sales fee engines inside
   taxpayer forms.
4. **Editable derived tables in provider UI** — especially
   `ProviderConfigurationState` and `ProviderFinancialProfile` as primary forms.
5. **Audit without before/after/actor/risk** on sensitive domains.
6. **New “settings dump” JSON columns** that recreate multiple domains in one
   blob when a table already owns the concern.
7. **Second membership / invite / document tables** with overlapping lifecycle.
8. **Using `ProviderFinancialProfile` as payout method storage** — that is
   `ProviderPaymentAccount`.

---

## New Table Decision Checklist

Before adding a table (or column) under provider configuration, answer all of
the following. If any answer is “an existing table already owns this,” stop.

1. **What single fact does this store?** (One sentence.)
2. **Which class is it?** Source / derived / audit / event log / snapshot.
3. **Who is the write owner?** (Module + API path.)
4. **Which Airbnb/Expedia surface does this map to?** If none and it duplicates
   two surfaces, split or delete the proposal.
5. **What would break if we stored this on an existing table instead?**
6. **How do audits capture mutations?** (`writeProviderAuditLog` or N/A for
   pure derived recompute.)
7. **How do governance / finance / booking consume it without copying columns?**
8. **What is explicitly out of scope for this table?**

Update this document in the same PR that introduces the table.

---

## Guardrails

- New provider-facing mutations must target source-of-truth tables only.
- Governance recompute may write `ProviderConfigurationState`.
- Finance jobs may write `ProviderFinancialProfile` as a rollup, not as taxpayer
  or payout-method authoring.
- Integration runtime may append `ProviderIntegrationSyncLog`.
- Sensitive settings mutations must call `writeProviderAuditLog` with
  `beforeJson`, `afterJson`, `actorUserId` and `riskLevel`.
- `ProviderProfile` columns are operational only.
- `ProviderTaxConfiguration` is the only provider fiscal-identity store.
- `TaxFeeDefinition` + `TaxFeeAssignment` are the only configurable sales
  taxes/fees contract (with `BookingTaxFee` as booking snapshot).
- `ProviderPaymentAccount` is the only payout-method store.
- `ProviderIntegrationConnection` is the only connector configuration store;
  readiness is derived from its status.
- `ProviderInvitation` + `ProviderUser` are the only team membership lifecycle
  stores; resolve permissions in code.
- Do not reintroduce legacy contractual or readiness columns when a source
  already exists — migrate readers, then drop the duplicate.
