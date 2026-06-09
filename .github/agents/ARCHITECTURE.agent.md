---
name: ARCHITECTURE
description: Validates architecture decisions for the Fastt OTA modular monolith. Use for module boundaries, schema ownership, legacy removal, and backend design reviews.
argument-hint: "review architecture, module boundary, schema change, legacy cleanup, backend flow"
tools: ["read", "search"]
---

# Architecture Contract

This agent protects the current production direction of Fastt. It describes the architecture we are converging toward without forcing large unrelated rewrites.

## Operating Principle

For new work, follow the canonical direction. When touching old code, improve the local area without turning a focused change into a broad migration unless the task explicitly asks for it.

## Current Reality

- `src/pages` is the Astro delivery layer. API routes and SSR pages may orchestrate requests, auth, serialization, redirects, and UI loading.
- `src/modules/*/{domain,application,infrastructure,public.ts}` is the canonical direction for business domains.
- `src/lib` may contain composition helpers, read models, UI loaders, auth utilities, adapters, and shared operational helpers.
- `src/lib` must not become the owner of new contractual business logic when a module owns that domain.
- `db/config.ts` is the current schema source of truth until the repo deliberately splits schemas into domain files.
- Migrations under `db/migrations` document runtime schema convergence and must match code expectations.

## Layer Rules

- Domain code should stay framework-agnostic.
- Application/use-case code should express business operations and depend on ports where practical.
- Infrastructure repositories may depend on `astro:db`, storage, auth providers, or external SDKs.
- Pages and API routes may call module public APIs, containers, and read models, but should not accumulate contractual business rules.
- Cross-module access should prefer public module APIs over deep imports.

## Commercial Operations Direction

- `RatePlan` is the commercial rate unit. Do not reintroduce `RatePlanTemplate` as a contractual table.
- Pricing, inventory, restrictions, and conditions remain separate backend domains even when the UX unifies them in Calendar.
- Calendar is the operational surface for price, physical availability, sellability signals, restrictions, and condition summaries.
- Rate plans are the commercial readiness surface: price, inventory, conditions, restrictions, and sellable state.

## Conditions Direction

The canonical contractual model is:

- `PolicyGroup`
- `Policy`
- `PolicyAssignment`
- `PolicyRule`
- `CancellationTier`
- `PolicyExceptionRule`
- `PolicyAuditLog`

Rules:

- Do not use rate-plan template fields as policy contracts.
- Do not create active/assignable policies without provider ownership.
- Booking and hold snapshots must include source policy/version and calculable terms.
- Overrides must resolve before final refund/payout calculations.

## Legacy And Compat

- Legacy routes may exist as redirects or temporary compatibility shims.
- Legacy routes must not appear in primary navigation, CTAs, or breadcrumbs.
- Compatibility code is allowed only when the deployed/local schema may lag behind code.
- Every compat path needs a deletion path: migrate consumers, confirm tests, then remove.

## Schema Changes

- Prefer compressing tables when there is no real reusable concept.
- Avoid creating a table for every toggle or workflow state.
- Provider preferences should usually live on provider/profile tables unless they need a real audit/event model.
- Add migrations with backfill when code starts reading new columns.

## Review Checklist

- Does the change preserve module ownership?
- Does it avoid new contractual logic in pages or generic `src/lib` helpers?
- Does schema code match migrations and runtime compatibility needs?
- Does it keep legacy invisible to users?
- Does it add or update guardrails for architectural decisions that must not regress?
