# ADR 0008: Versioned document definitions

Status: accepted
Document type: decision
Owner: Engineering / project owner
Last verified: 2026-10-29
Scope: configurable document definitions and immutable evidence references
Source of truth: this decision and the PostgreSQL schema
Related code/tests: src/shared/domain/document-acceptance.ts; tests/unit/document-acceptance.test.ts
Review trigger: production activation or change to acceptance semantics

## Context

Generic document categories cannot express specific evidence or complete alternative packages.
Existing files, inspections, review decisions and signed policies must remain intact.

## Decision

Add DocumentDefinition and DocumentDefinitionVersion. ProviderDocument references the exact
definition version and an optional predecessor. Reuse existing storage, inspections, scopes,
resources and audit. Definitions do not create legal requirements or authorize operations.
Published definitions are immutable. Signed policies retain historical acceptance semantics.
New acceptance contracts use alternatives of complete packages, evaluated separately per subject.

## Evidence gate

The project owner explicitly authorized a pre-launch exception on 2026-10-29 in this task,
limited to implementation and development migration. This is not 30-day volume evidence and
does not authorize production activation. Engineering owns implementation; the project owner
owns the exception. Operational pain: fixed generic types and ambiguous references documented
by the owner in this task on the same date. The reproducible inventory is
scripts/db/audit-document-catalog.ts; JSON alone cannot provide foreign-key version integrity.

## Schema sketch

DocumentDefinition has a unique stable key. DocumentDefinitionVersion references its definition,
with unique version number, lifecycle and typed capture contract. ProviderDocument references
the version with RESTRICT and its predecessor with RESTRICT. No historical file is deleted.

## Non-goals

No new upload engine, inferred legal equivalence, automatic approval, new country admission,
rewriting signed policy payloads or production migration.

## Consequences

Catalogue changes need versioning. Legacy evidence remains readable without automatic specific
classification. Publication continues through the existing policy evaluator, not a second gate.
