# Pricing V2 Architecture (RatePlan-first, Occupancy-aware)

## Canonical Sources

The pricing runtime is V2-only and must use these canonical sources:

- `EffectivePricingV2`: materialized nightly pricing by `(variantId, ratePlanId, date, occupancyKey)`.
- `RatePlanOccupancyPolicy`: canonical base pricing policy and occupancy pricing rules.

## Runtime Rules

1. Runtime pricing in `src/` must not reference V1 entities.
2. Forbidden runtime references:
   - `EffectivePricing`
   - `PricingBaseRate`
3. Search, Hold, Booking consistency invariant:
   - `Search total == Hold total == Booking total` for equivalent request/snapshot inputs.
4. Read paths must stay pure:
   - no implicit recompute
   - no implicit coverage generation
   - no auto-healing

## Coverage Model

Pricing coverage is explicit and request-scoped. Coverage must be materialized before pricing reads.

## Guardrail Enforcement

A hard-fail guardrail test enforces V2-only runtime usage:

- `tests/guardrails/pricing-v1-runtime-guardrail.test.ts`

This test scans `src/` runtime code and fails CI if any forbidden V1 token is reintroduced.
