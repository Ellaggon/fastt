# ADR 0006 — Sesiones independientes de configuración de opciones

Status: active
Document type: decision
Owner: Provider Experience / Engineering
Last verified: 2026-10-08
Scope: persistencia de asistentes de opciones sin alterar la preparación del producto
Source of truth: contrato de playbooks del proveedor y pruebas PostgreSQL
Related code/tests: `src/lib/onboarding/tourOptionSession.ts`, `tests/integration/tour-option-session-persistence.test.ts`
Review trigger: ampliar líneas admitidas o modificar identidad, concurrencia o cierre de sesiones

## Status

Accepted for the user-authorized option assistant. This is navigation persistence,
not a new tour resource, inventory or booking capability.

## Context and evidence

The existing session has one unique provider/user/product/playbook key. Two new
options need independent continuations. Extending that key breaks deployed writers
using four-column conflict inference; the authenticated local catalog exposed the
missing-column error during verification on 2026-10-08.

Owner: Provider Experience / Engineering. The repeatable evidence is the
PostgreSQL suite named above: simultaneous sessions, stale writes, foreign
relationships and preservation when product preparation completes. A thirty-day
booking-volume gate does not establish navigation correctness; no volume is claimed.

## Decision and schema sketch

Add `ProviderOptionPreparationSession`: session primary key, existing Provider,
User and Product foreign keys; validated Variant/RatePlan relationships; step,
path, status and timestamps. Reuse forms, diagnostic and atomic activation.
Keep `ProviderPreparationSession` and its unique key unchanged. Apply an additive
migration before exposing the assistant; no historical session conversion.

## Non-goals and consequences

No new inventory, reservation path, commercial defaults or copied approvals.
Abandoning a session preserves its option; activation does not publish the product.
Use optimistic navigation concurrency and immutable option binding. Production
rollback may leave this additive table; older writers remain compatible.
