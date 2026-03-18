---
name: ARCHITECTURE_SOURCE_OF_TRUTH
description: Enforces the canonical architecture of the OTA modular monolith. Use this agent to validate decisions, review changes, and ensure strict compliance with architectural boundaries.
argument-hint: "Validate changes", "Review architecture", "Check layer violations", "Propose structure"
tools: ["read", "search"]
---

# ARCHITECTURE_SOURCE_OF_TRUTH

This document is the single authoritative standard for the OTA modular monolith architecture. All code, refactors, and agent changes MUST comply with it.

## 1. Architectural Philosophy

### 1.1 Goals

The system MUST support long-term evolution into a production-grade OTA (Online Travel Agency) with:

- multiple product types (hotels, tours, packages)
- search pipelines and offer building
- pricing and rate plans
- inventory and availability
- booking flows
- policy systems
- integrations and future external provider connectivity

### 1.2 Core Principles (Non-Negotiable)

1. **Framework-agnostic core**: domain and application code MUST NOT depend on Astro, React, Vercel adapters, or any UI/web framework.
2. **Infrastructure isolation**: database, storage, auth providers, and third-party SDKs MUST be isolated behind infrastructure adapters.
3. **Replaceable persistence**: switching from Turso/libsql to Supabase/Postgres MUST require changes ONLY in infrastructure (and DB migrations), not in domain/application.
4. **Strict boundaries**: each layer MUST have explicit responsibilities and explicit forbidden dependencies.
5. **Modular monolith**: the system MUST be a single deployable unit, partitioned into modules with clear ownership and controlled cross-module interactions.
6. **Agent-enforceable**: rules MUST be verifiable via static checks (lint/boundaries rules) and code review automation.

### 1.3 Current Repository State (Observed Constraints)

The repository currently exhibits these architectural violations and coupling patterns:

- direct `astro:db` access spread across `src/pages`, `src/components`, `src/core`, `src/application`, `src/lib`, and `src/jobs`
- mixed persistence styles (`repositories/*` plus `lib/db/*` helpers plus direct DB usage)
- API routes containing business logic and multi-table transactions
- domain-ish engines importing repositories or DB logic, violating core purity
- duplicated implementations (notably inventory bootstrap)
- weak typing in the search pipeline (`any`-shaped memory/adapters)
- presence of documentation-like or AI-generated runtime files that do not belong in `src/` runtime

This document defines the target architecture independent of the current state.

---

## 2. Canonical Folder Structure (Authoritative)

The repository MUST conform to the following structure. Paths are normative.

```text
src/
  modules/
    catalog/
      domain/
      application/
      infrastructure/
      public.ts

    inventory/
      domain/
      application/
      infrastructure/
      public.ts

    pricing/
      domain/
      application/
      infrastructure/
      public.ts

    policies/
      domain/
      application/
      infrastructure/
      public.ts

    search/
      domain/
      application/
      infrastructure/
      public.ts

    booking/
      domain/
      application/
      infrastructure/
      public.ts

    integrations/
      domain/
      application/
      infrastructure/
      public.ts

    identity/
      domain/
      application/
      infrastructure/
      public.ts

    payments/
      domain/
      application/
      infrastructure/
      public.ts

  api/
    routes/
    middleware/
    serializers/
    index.ts

  web/
    pages/
    components/
    layouts/
    client/
      api.ts
      types.ts

  shared/
    domain/
    application/
    infrastructure/

db/
  schemas/
    catalog.schema.ts
    inventory.schema.ts
    pricing.schema.ts
    policies.schema.ts
    booking.schema.ts
    identity.schema.ts
    payments.schema.ts
    integrations.schema.ts
  config.ts
  seed.ts

docs/
  architecture/
    ARCHITECTURE_SOURCE_OF_TRUTH.md
```
