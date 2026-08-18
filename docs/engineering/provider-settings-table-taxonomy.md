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

| Concern                        | Airbnb-style surface               | Expedia-style surface             | Fastt owner                                 |
| ------------------------------ | ---------------------------------- | --------------------------------- | ------------------------------------------- |
| Account / ops defaults         | Account settings                   | Partner profile / property admin  | `Provider` + `ProviderProfile`              |
| Taxpayer / tax registration    | Taxes → Taxpayers                  | Financials → Tax & Registration   | `ProviderTaxConfiguration`                  |
| Occupancy / sales taxes & fees | Listing tax tools / fee settings   | Property taxes & fees             | `TaxFeeDefinition` + `TaxFeeAssignment`     |
| Payout methods                 | Payments → Payout methods          | Financials → Bank / payout        | `ProviderPaymentAccount`                    |
| Team & permissions             | Hosting team / co-host permissions | Partner users & roles             | `ProviderUser` + `ProviderInvitation`       |
| Identity / business docs       | Identity & business verification   | Onboarding document requests      | `ProviderDocument` + `ProviderVerification` |
| Connectivity                   | Channel / calendar / API tools     | Connectivity providers / CRS / CM | `ProviderIntegrationConnection`             |

---

## Classification Model

Every configuration-related table belongs to exactly one of these classes:

| Class                     | Mutability                                   | Purpose                              | If wrong, fix by…                                                |
| ------------------------- | -------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| **Source of truth**       | Provider- or platform-editable inputs        | Authoritative place to define a fact | Editing the owning table through its domain API                  |
| **Derived / read model**  | System-written projection                    | Fast capability / eligibility reads  | Recomputing from sources                                         |
| **Audit log**             | Append-only mutation history                 | Who changed what, before/after, risk | Writing via `writeProviderAuditLog` (never hand-editing history) |
| **Operational event log** | Append-only telemetry                        | Connector sync / delivery traces     | Emitting events from integration ops                             |
| **Snapshot**              | Immutable frozen contract at a point in time | Preserve sold or evaluated state     | Creating a new snapshot; never mutating old ones                 |

Do not invent a sixth class for “temporary compatibility columns.” Prefer a
migration that deletes the duplicate.

---

## Source Of Truth

Source-of-truth tables are the editable contractual or operational inputs.
Mutations must target these tables through their owning domain. Derived tables,
audit rows and snapshots may read them, but must not become the place where
providers redefine the fact.

### Identity And Operations

| Table             | Owner          | Role                                                                                                    |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `Provider`        | Catalog        | Commercial identity: legal name, display name, lifecycle status.                                        |
| `ProviderProfile` | Settings / Ops | Operational defaults only: timezone, default currency and support contacts.                              |
| `ProviderUser`    | Settings / Ops | Provider membership, role, grants and the member's Esencial/Profesional workspace preference.             |

`ProviderProfile` must **not** store fiscal identity, payout readiness or
integration readiness. Those belong to the tables below.

### Fiscal Identity Vs Sales Tax Application

These are two different products. Mixing them recreates the Airbnb mistake of
putting taxpayer forms inside listing tax tools (or the reverse).

| Table                      | Owner             | Role                                                                                                                                           |
| -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderTaxConfiguration` | Settings / Fiscal | Provider taxpayer / tax-registration identity and fiscal readiness (`status`, residence country, registration number, regime, invoicing mode). |
| `TaxFeeDefinition`         | Taxes & Fees      | Canonical commercial tax or fee rule applied to sellable prices.                                                                               |
| `TaxFeeAssignment`         | Taxes & Fees      | Scope/channel application of a definition to provider, product, variant, rate or global scope.                                                 |

**TaxConfiguration status ownership (Airbnb/Expedia-aligned):** the provider may
only produce `not_configured` | `pending` by submitting identity fields.
Transitions to `verified` | `requires_attention` are internal-admin only
(`POST /api/admin/providers/tax-configuration`). Providers never self-certify.

Cross-reference: `TaxFeeDefinition` / `TaxFeeAssignment` are also listed in the
Rooms & Rates taxonomy because booking, search and finance consume them. Their
**write owner** remains taxes/fees, not provider profile.

### Payments

| Table                    | Owner    | Role                                                                           |
| ------------------------ | -------- | ------------------------------------------------------------------------------ |
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

| Table                  | Owner        | Role                                                                                                                                  |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderDocument`     | Verification | Submitted compliance artifacts (identity, business registration, tax docs, ownership, licenses, address proof) with review lifecycle. |
| `ProviderVerification` | Verification | Append-only compliance decisions (`pending` / `approved` / `rejected`). Latest row by `createdAt`/`id` is the effective decision.     |

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

| Table                | Owner | Role                                                                                                        |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `ProviderUser`       | Team  | Active membership: `role` (`owner` \| `admin` \| `staff`) plus optional `permissionsJson` domain overrides. |
| `ProviderInvitation` | Team  | Pending invite lifecycle: email, role, status, invitedBy, expiresAt, acceptedAt.                            |

Effective permissions are resolved in application code
(`resolveProviderPermissions`). Do not invent a second membership table.

### Integrations

| Table                            | Owner        | Role                                                                                                                                                                                                                                   |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderIntegrationConnection`  | Integrations | **Root** connector instance: connector key, lifecycle `status`, mode, scopes, public HTTPS `endpointUrl`, vendor/auth metadata, sync schedule summary, optional `catalogJson` **smoke/preview cache** (not catalog SoT — see Phase 6). |
| `ProviderIntegrationCredential`  | Integrations | **Secret** vault row (1:1 with connection): encrypted tokens, auth type, expiry/refresh, revoke.                                                                                                                                       |
| `ProviderIntegrationMapping`     | Integrations | Local ↔ external entity links for channel managers (rooms, rates, properties, etc.).                                                                                                                                                   |
| `ProviderExternalCalendar`       | Integrations | **Subresource** of an `external_calendars` connection: inbound iCal feed config + per-feed sync state.                                                                                                                                 |
| `ProviderExternalCalendarEvent`  | Integrations | Normalized busy blocks from a feed (drives inventory `externalBlockedUnits`).                                                                                                                                                          |
| `ProviderExternalCalendarExport` | Integrations | Outbound shareable ICS export tokens (create / render / revoke).                                                                                                                                                                       |

Operational integration tables (job, run, incident, conflict, deprecated
event log) are classified under [Integrations Ownership](#integrations-ownership).
`endpointUrl` is public connector configuration, never a secret pointer.
Encrypted API keys, references and OAuth tokens live only in
`ProviderIntegrationCredential`. Never put plaintext secrets in audit payloads.

---

## Derived / Read Model

Derived/read-model tables are projections. They exist for dashboard readiness,
capability gates and finance ops. If a derived row is wrong, fix the source or
recompute — do not “correct” readiness by editing the projection by hand in
product UI.

| Table                        | Derived From                                                                                                                             | Role                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ProviderConfigurationState` | `evaluateProviderGovernance` over identity, profile, verification, documents, tax config, tax fees, payment accounts, integrations, team | Persisted capability snapshot: publish / bookings / payments / integrations, readiness percent, blockers and risks.          |
| `ProviderFinancialProfile`   | Payment accounts, tax configuration, finance operations                                                                                  | Aggregated finance eligibility summary consumed by financial workflows. Not the payout method store. Not the taxpayer store. |

Non-table derived signals (computed in governance, not persisted as columns on
`ProviderProfile`):

| Signal                | Derived From                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment readiness     | Verified `ProviderPaymentAccount` only (`ProviderFinancialProfile` is rollup, not a shortcut). Upsert to `ready` requires a verified payout account.                |
| Integration readiness | `ProviderIntegrationConnection.status = connected` **and** successful smoke `lastSyncStatus` (`success`/`ok`). Saving credentials yields `pending` until sync test. |
| Fiscal readiness      | `ProviderTaxConfiguration.status = verified` only. Active `TaxFeeDefinition` + country is a **risk** if taxpayer is unverified, never `complete`.                   |
| Documents readiness   | Verified minimum KYC set: `government_id` + `business_registration` + `tax_document`. Approved `ProviderVerification` does **not** bypass.                          |

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

| Table              | Owner      | Role                                                                                                                                    |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderAuditLog` | Governance | Provider-scoped mutation audit: `actorUserId`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `riskLevel`, `createdAt`. |

### Audit contract

Sensitive writes in fiscal profile, payments, integrations, team, documents and
operational profile must go through `writeProviderAuditLog`
(`src/lib/provider-audit.ts`) and must include:

1. `actorUserId`
2. `beforeJson` (explicit `null` on creates)
3. `afterJson`
4. `riskLevel` (`low` \| `medium` \| `high`)

Secrets (`credentialSecret`, tokens, passwords) are redacted by
`snapshotForProviderAudit`. Do not bypass the helper to store raw secrets in
audit JSON.

`ProviderAuditLog` is not a source of truth for current configuration. Current
state lives in source tables; audit explains how it got there.

---

## Operational Event Log

Distinct from governance audit: connector **execution** history is owned by
`ProviderIntegrationSyncRun` (see [Integrations Ownership](#integrations-ownership)).
Config mutations (connect / update / revoke / credential refresh) remain on
`ProviderAuditLog`.

| Table                            | Owner        | Role                                                                                                                        |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| ~~`ProviderIntegrationSyncLog`~~ | Integrations | **Removed (Phase 2).** Legacy activity feed dropped. Do not recreate. UI “Actividad reciente” reads SyncRun + config Audit. |

`ProviderAuditLog` stays the compliance-grade mutation history. Do not merge
Audit into SyncRun.

---

## Snapshot

Snapshots freeze an evaluated or sold state so later source edits do not rewrite
history. Configuration’s primary snapshot is governance state; booking-time tax
snapshots live with the booking aggregate (see Rooms & Rates taxonomy).

| Table                        | Captures                          | Role                                                                                                                                                                                |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderConfigurationState` | Latest governance evaluation      | Capability / blocker snapshot for settings summary, publish gates and simulations. Treated as derived+snapshot: overwritten on re-evaluate, never manually edited as product truth. |
| `BookingTaxFee`              | Tax/fee breakdown at booking time | Immutable sales-tax snapshot on the booking contract. Owned by booking; sourced from `TaxFeeDefinition` / `TaxFeeAssignment` resolution.                                            |

`ProviderConfigurationState` may be classified as both derived and snapshot: it
is recomputed from sources, but consumers may read it as the last known gate
state without re-running full governance.

---

## Domain Ownership Map

| Domain                 | Write APIs / libs (canonical)                                                                                                         | Must not write                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ops profile            | `/api/providers/profile`, `upsertProviderProfileV2`                                                                                   | Tax, payment, integration readiness fields                                     |
| Fiscal identity        | `/api/provider/settings/tax-configuration`, `provider-tax-configuration`                                                              | `TaxFeeDefinition` / assignments                                               |
| Sales taxes & fees     | `/api/provider/tax-fees/*`, taxes-fees module                                                                                         | `ProviderTaxConfiguration`                                                     |
| Payout methods         | `/api/provider/settings/payment-accounts`, `provider-payment-accounts` (admin review: `/api/admin/providers/payment-accounts`)        | Self-verify; readiness flags on `ProviderProfile`                              |
| Documents              | `/api/provider/settings/documents`, `provider-documents`                                                                              | Verification decision stream except via review actions                         |
| Compliance ops console | `/admin/providers`, `provider-admin-compliance`, `GET /api/admin/providers/compliance` + review POSTs under `/api/admin/providers/*`  | Provider-facing self-certify; editing `ProviderConfigurationState` as settings |
| Team                   | `/api/provider/settings/invitations`, permissions helpers                                                                             | Ad-hoc membership tables                                                       |
| Integrations           | `/api/provider/integrations/*`, `provider-integrations`, `provider-external-calendars`, `provider-integration-operations`, schedulers | Profile readiness flags; parallel per-connector job/incident tables            |
| Governance             | `evaluateProviderGovernance`, `writeProviderAuditLog`                                                                                 | Manual edits to `ProviderConfigurationState` as if it were settings UI         |

---

## Integrations Ownership

Every integrations table belongs to exactly one **ownership class**. Before
proposing a new `ProviderIntegration*` or `ProviderExternalCalendar*` table,
name the class and explain why an existing table in that class cannot hold the
fact. If the answer is “we already have a job / run / incident / conflict /
subresource for this,” stop.

### Ownership classes

| Class           | Table(s)                                                    | Role                                                                                                                                                                                                                                                                                                | Not for                                                              |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Root**        | `ProviderIntegrationConnection`                             | Canonical connector instance (Cloudbeds, Channex, `external_calendars`, etc.). Multiple instances per `connectorKey` allowed; at most one `isPrimary` per `(providerId, connectorKey)`.                                                                                                             | Per-feed iCal state; encrypted secrets; overlap alerts               |
| **Secret**      | `ProviderIntegrationCredential`                             | Encrypted auth material for one connection (PK = `connectionId`).                                                                                                                                                                                                                                   | Public endpoints (`endpointUrl` stays on Connection)                 |
| **Subresource** | `ProviderExternalCalendar`, `ProviderExternalCalendarEvent` | Domain-specific payload under a root connection. Calendars are feeds; events are normalized blocks.                                                                                                                                                                                                 | Generic connector lifecycle; channel-manager mappings                |
| **Mapping**     | `ProviderIntegrationMapping`                                | Fastt ↔ external entity equivalences for CM-style connectors.                                                                                                                                                                                                                                       | iCal variant/resource binding (use calendar columns)                 |
| **Job**         | `ProviderIntegrationSyncJob`                                | Universal worker queue (`targetType` + `targetId` + `operation`, lease/retry/idempotency). Connection and iCal jobs share one table.                                                                                                                                                                | Execution history; user-facing activity                              |
| **Run**         | `ProviderIntegrationSyncRun`                                | Durable execution ledger (operation, trigger, counters, cursor, error, summary). Shared by generic sync and `calendar_import`. Powers simple-mode activity + Pro run history.                                                                                                                       | Config mutation audit; lightweight UI chatter                        |
| **Incident**    | `ProviderIntegrationIncident`                               | Actionable connector/ops failures (auth, remote API, mapping, data quality) with optional notifications.                                                                                                                                                                                            | Inventory date overlaps (use Conflict)                               |
| **Conflict**    | `ProviderExternalCalendarConflict`                          | Specialized overlap **alert** inbox (booking ↔ iCal, iCal ↔ iCal) with accept / ignore / resolve. Status changes are alert-only: they do **not** mutate inventory; blocks already applied during feed sync. Do not mirror into Incident. Hiding accepted/ignored from the host list is intentional. | Sync/auth failures (use Incident); inventing a second problems inbox |
| **Export**      | `ProviderExternalCalendarExport`                            | Outbound ICS share links (token hash, download metrics, revoke). Synchronous render — not an async job queue.                                                                                                                                                                                       | Inbound feed sync                                                    |

### State ownership

Each status answers one question only. Consumers must read the owning entity
instead of copying its state into a neighboring table.

| Owner                              | Status answers                                        | Vocabulary                                                                                    | Authorized writer                                                                                | Must not represent                                           |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `ProviderIntegrationConnection`    | Is the connector usable overall?                      | `not_configured`, `pending`, `connected`, `requires_attention`, `syncing`, `error`, `revoked` | Connector connect/test/revoke services; for iCal, only `refreshExternalCalendarConnectionRollup` | One feed attempt, queue progress, incident resolution        |
| `ProviderExternalCalendar`         | Is this individual inbound feed usable?               | `pending`, `active`, `error`, `revoked`                                                       | Calendar create/sync/revoke services and calendar-job failure handling                           | Aggregate connector health or historical run outcome         |
| `ProviderIntegrationSyncJob`       | What should the worker execute next?                  | `queued`, `running`, `succeeded`, `failed`                                                    | Universal queue claim/retry/finish functions                                                     | User-facing connector health or durable execution analysis   |
| `ProviderIntegrationSyncRun`       | What was the durable result of one execution?         | `running`, `succeeded`, `partial`, `failed`, `cancelled`                                      | Sync orchestration start/finish functions                                                        | Pending work, current connector readiness or alert decisions |
| `ProviderIntegrationIncident`      | Does a technical problem still require action?        | `open`, `resolved` plus independent severity                                                  | Incident record/resolve service                                                                  | Calendar overlaps or routine failed-run history              |
| `ProviderExternalCalendarConflict` | What decision did the operator make about an overlap? | `open`, `accepted`, `ignored`, `resolved`                                                     | Conflict reconciliation and explicit host actions                                                | Technical connector failures or inventory mutation state     |

Propagation is directional: a Job may create a Run; a failed Run may open an
Incident; feed results may refresh the Connection aggregate. A Conflict never
changes availability by status alone. No reverse propagation may rewrite
historical Runs or completed Jobs.

### Status contracts

**`ProviderIntegrationConnection`**

- `status` = connector **lifecycle**: `not_configured` \| `pending` \| `connected` \| `requires_attention` \| `syncing` \| `error` \| `revoked`.
- `lastSyncStatus` = **outcome of the last sync attempt** (e.g. `success`, `error`, `reference_valid`, `not_modified`), not a substitute for lifecycle `status`.
- Example valid pair: `status = connected`, `lastSyncStatus = success`.
- Avoid ambiguous pairs such as treating `lastSyncStatus` as the only readiness signal without `status`.
- **DB CHECK (Phase 7):** `ProviderIntegrationConnection_status_check` and
  `_mode_check` (`sandbox` \| `production`). App helpers:
  `assertProviderConnectorStatus` / `assertProviderConnectorMode`.

**`ProviderExternalCalendar` vs Connection rollup**

- Calendar row = **granular** feed truth: per-feed `status` (`pending` \| `active` \| `error` \| `revoked`), `lastSyncAt` / `lastSyncStatus` / `lastError`, `syncEnabled`, `syncIntervalMinutes`, `nextSyncAt`, `consecutiveFailures`.
- **DB CHECK (Phase 7):** `ProviderExternalCalendar_status_check`. App helper:
  `assertProviderExternalCalendarStatus`.
- Due scheduling for iCal is **calendar-level** (`ProviderExternalCalendar.nextSyncAt`). The generic integration scheduler excludes `connectorKey = external_calendars` and must not treat connection `nextSyncAt` as a due-source for feeds.
- Connection with `connectorKey = external_calendars` = **aggregated rollup** written only by `refreshExternalCalendarConnectionRollup(providerId)` after create/sync/revoke (and after calendar job failure side-effects). Rules: no feeds → `not_configured`; all revoked → `revoked`; any feed `error` → `requires_attention`; all pending → `pending`; otherwise `connected`. Connection `syncEnabled` stays `false`.
- `ProviderExternalCalendar.connectionId` is **NOT NULL** (every feed belongs to the rollup connection) with **ON DELETE CASCADE** (feeds die with the rollup connection).

**Export scope (Phase 7 honesty)**

- Outbound ICS (`ProviderExternalCalendarExport`) is **variant-scoped only**.
  `BookingRoomDetail` has no `resourceId`, so the render path cannot honestly filter
  by physical unit.
- Export no longer has `resourceId`. Do not reintroduce that column or a “Unidad
  física” control until bookings can bind to `InventoryResource` and the renderer
  can enforce unit scope end to end.
- Inbound feeds still use `resourceId` for inventory blocks — that path is real.

**Related status CHECKs (Phase 7)**

Also constrained: Mapping (`active`/`inactive`), SyncRun, SyncJob, Incident
status/severity, Conflict, Export status. Partial due-sync indexes remain
migration SoT (`WHERE syncEnabled AND status <> 'revoked'`); Drizzle mirrors them;
The generated PostgreSQL baseline mirrors these predicates and cascade rules.
**Cache columns (not sources of truth)**

See [Phase 6 — `catalogJson` smoke/preview cache](#phase-6--catalogjson-smokepreview-cache)
below. Summary:

- `catalogJson` / `lastCatalogSyncAt` on Connection are a **temporary smoke/preview
  cache** for channel managers only — not durable catalog SoT.
- Durable local↔external identity lives in `ProviderIntegrationMapping` rows.
- Do **not** invent `ProviderIntegrationRemoteEntity` until a real Cloudbeds/Channex
  (or equivalent) importer needs query-by-`entityType`/`externalId`.
- Removed in Phase 1: Connection `previewJson` / `lastPreviewAt` (never used) and
  Calendar `syncLeaseToken` / `syncLeaseUntil` (locking lives on SyncJob).

### Phase 6 — `catalogJson` smoke/preview cache

**Purpose**

After a successful channel-manager API smoke/sync probe, Connection may store a
small JSON blob so operators can see “last verified vendor / property / probe”
without a second round-trip. That blob is a **product cache**, not a remote
entity model.

**What may live in `catalogJson` today**

- Vendor key, auth type, external property id (denormalized from Connection columns).
- Last smoke probe name + message.
- A short note that a vendor-specific catalog import is still future work.

**What must not live there**

- Room / rate / listing catalogs treated as SoT for mapping UI or sync.
- Arrays of remote entities that mappings are derived from at read time.
- Secrets, tokens, or full API payloads.

**Conceptual product limits** (enforced in write path via
`PROVIDER_INTEGRATION_CATALOG_CACHE` in `src/lib/provider-integrations.ts`):

| Limit               | Value                                | Rationale                                                                  |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Max serialized size | **32 KiB**                           | Keeps Connection rows lean; overflow stores a stub note instead of a blob. |
| Freshness / TTL     | **7 days** (via `lastCatalogSyncAt`) | Stale cache is informational only; remapping and sync must not require it. |

`lastCatalogSyncAt` is the cache clock. Consumers that display the blob should
treat age > TTL as “possibly stale preview”, never as “catalog import failed”.

**Source of truth rules**

| Concern                            | SoT                              | Not SoT                            |
| ---------------------------------- | -------------------------------- | ---------------------------------- |
| Local ↔ external binding           | `ProviderIntegrationMapping`     | `catalogJson`                      |
| Connection lifecycle / credentials | Connection + Credential          | `catalogJson`                      |
| Smoke probe outcome for CM         | SyncRun + Connection `lastSync*` | `catalogJson` may mirror a summary |

**Grep / code contract**

- Writers: only the channel-manager sync path may set `catalogJson`.
- Readers of mappings: `listProviderIntegrationMappingCatalog` /
  `upsertProviderIntegrationMapping` must load `ProviderIntegrationMapping` —
  never parse `catalogJson` to invent mapping rows.
- No table or type named `ProviderIntegrationRemoteEntity` until an importer
  needs indexed remote entities.

**When a real CM catalog importer lands (Cloudbeds / Channex / …)**

1. Persist typed remote entities (then — and only then — consider
   `ProviderIntegrationRemoteEntity` or an equivalent queryable store).
2. Fill `ProviderIntegrationMapping` from those typed entities (or from an
   explicit provider mapping step), not from opaque JSON.
3. Make `catalogJson` optional (summary-only) or remove it in a follow-up
   migration once UI no longer needs the smoke stub.

### Schema freeze (Phases 1–6)

Phases 1–5 closed the operational shape (dead weight, SyncLog, universal job,
calendar rollup, conflict inbox). Phase 6 freezes **catalog modeling**:

**Still frozen:**

- No new tables named `ProviderIntegration*` or `ProviderExternalCalendar*`.
- Especially: **no `ProviderIntegrationRemoteEntity`** until a real importer
  needs `entityType` / `externalId` queries.
- No second job queue, second execution ledger, or second “problems inbox”.
- No SyncLog recreation.
- Do not promote `catalogJson` into a durable catalog schema.

**Allowed:**

- Documentation and this taxonomy.
- Bug fixes that do not add tables.
- Enforcing cache size/TTL on the existing Connection columns.
- Phase 7 status CHECKs / variant-only export honesty without new entity tables.
- Emergency production hotfixes (must name which ownership class they touch and
  why an existing table was insufficient).

### Phase 7 — Constraint hardening

Shipped in `db/migrations/2026-08-08_provider_integration_constraint_hardening.sql`:

1. **Status/mode CHECKs** for Connection + Calendar (plus Mapping, SyncRun,
   SyncJob, Incident, Conflict, Export) matching the TypeScript vocabularies.
2. **Partial due-sync indexes** reaffirmed; Drizzle declares `.where(...)` and
   the generated PostgreSQL baseline preserves the predicates.
3. **`ProviderExternalCalendar.connectionId` ON DELETE CASCADE** — feeds are
   subresources of the rollup connection.
4. **Export honesty** — variant-only ICS scope; Export has no `resourceId` and
   the UI offers no fake physical-unit filter.

**After Phase 7:** prefer extending CHECKs on existing columns over new tables
when locking vocabularies.
**After Phase 3:** new connector work must reuse Root → Secret → Mapping → Job →
Run → Incident (plus Subresource/Conflict/Export only when the domain truly
needs them). Prefer columns or `operation` / `targetType` values on the
universal job over a new table.

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
9. **Parallel integration ops stacks** — a second SyncJob / SyncRun / Incident /
   Conflict table per connector. Extend the universal
   `ProviderIntegrationSyncJob` (`targetType` / `operation`) or an existing
   subresource instead.
10. **Mirroring calendar Conflicts into Incidents** (or the reverse) — two
    problem inboxes for one alert. Overlaps stay on
    `ProviderExternalCalendarConflict`; connector failures stay on
    `ProviderIntegrationIncident`.
11. **Recreating SyncLog** — use SyncRun and/or AuditLog.
12. **Treating `catalogJson` as mapping/catalog SoT** — mappings are
    `ProviderIntegrationMapping` rows; do not parse opaque Connection JSON to
    invent local↔external bindings. Do not add `ProviderIntegrationRemoteEntity`
    until a real CM importer needs queryable remote entities.

---

## New Table Decision Checklist

Before adding a table (or column) under provider configuration, answer all of
the following. If any answer is “an existing table already owns this,” stop.

1. **What single fact does this store?** (One sentence.)
2. **Which class is it?** Source / derived / audit / event log / snapshot.
   For integrations, also name the **ownership class**: root / secret /
   subresource / mapping / job / run / incident / conflict / export.
3. **Who is the write owner?** (Module + API path.)
4. **Which Airbnb/Expedia surface does this map to?** If none and it duplicates
   two surfaces, split or delete the proposal.
5. **What would break if we stored this on an existing table instead?**
6. **How do audits capture mutations?** (`writeProviderAuditLog` or N/A for
   pure derived recompute.)
7. **How do governance / finance / booking consume it without copying columns?**
8. **What is explicitly out of scope for this table?**
9. **Integrations freeze:** If the name matches `ProviderIntegration*` or
   `ProviderExternalCalendar*` and Phases 1–3 are not closed, stop unless it is
   an explicitly allowed Phase 1–3 consolidation change (see
   [Schema freeze](#schema-freeze-phases-1-6)).

Update this document in the same PR that introduces the table.

---

## Guardrails

- New provider-facing mutations must target source-of-truth tables only.
- Governance recompute may write `ProviderConfigurationState`.
- Finance jobs may write `ProviderFinancialProfile` as a rollup, not as taxpayer
  or payout-method authoring.
- Integration **executions** append `ProviderIntegrationSyncRun` (canonical).
  `ProviderIntegrationSyncLog` was removed in Phase 2 — do not recreate it.
- Sensitive settings mutations must call `writeProviderAuditLog` with
  `beforeJson`, `afterJson`, `actorUserId` and `riskLevel`.
- Simple-mode “Actividad reciente” reads SyncRun + config Audit for the connector.
- `ProviderProfile` columns are operational only.
- `ProviderTaxConfiguration` is the only provider fiscal-identity store.
- `TaxFeeDefinition` + `TaxFeeAssignment` are the only configurable sales
  taxes/fees contract (with `BookingTaxFee` as booking snapshot).
- `ProviderPaymentAccount` is the only payout-method store.
- `ProviderIntegrationConnection` is the only connector **root** configuration
  store; readiness is derived from its status + successful smoke
  `lastSyncStatus`. Secrets live in `ProviderIntegrationCredential`. iCal feeds
  are subresources (`ProviderExternalCalendar*`), not parallel roots.
- Until Phases 1–3 close: no new `ProviderIntegration*` /
  `ProviderExternalCalendar*` tables (see
  [Schema freeze](#schema-freeze-phases-1-6)). Phase 3 landed a universal
  `ProviderIntegrationSyncJob` (`targetType` / `targetId`); do not recreate
  `ProviderExternalCalendarSyncJob`.
- `ProviderInvitation` + `ProviderUser` are the only team membership lifecycle
  stores; resolve permissions in code.
- Do not reintroduce legacy contractual or readiness columns when a source
  already exists — migrate readers, then drop the duplicate.
