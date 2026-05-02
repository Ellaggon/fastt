# Pricing V2 Architecture (Source of Truth)

## Canonical identity

Pricing V2 is canonical by:

- `(variantId, ratePlanId, date, occupancyKey)` for effective prices
- `ratePlanId` as the only selector for pricing mutations and previews

`variantId` is never a semantic pricing selector. It is allowed only for:

- physical-unit ownership checks
- inventory/catalog context
- cache invalidation context

## Canonical sources

Runtime pricing reads use:

- `EffectivePricingV2` for materialized effective pricing
- `RatePlanOccupancyPolicy` for canonical base policy and occupancy policy

Legacy V1 pricing entities are forbidden at runtime.

## Runtime invariants

1. `Search == Hold == Booking` totals for equivalent inputs/snapshots.
2. `Preview == Effective == Search` under same rule/base context.
3. Read paths are pure:
   - no implicit recompute
   - no implicit coverage generation
   - no auto-healing writes
4. Search runtime is read-only and cannot trigger backfill side-effects.
5. Hold is occupancy-canonical:
   - input uses `occupancyDetail`
   - `rooms` is separate from occupancy
   - snapshot preserves full `occupancyDetail`
6. Booking consumes hold snapshot and must not recompute pricing.
7. Catalog does not decide pricing logic; it only consumes pricing read summaries.

## Hard prohibitions

- Pricing mutations without explicit `ratePlanId` are forbidden.
- `variantId` cannot be used directly or indirectly to select pricing.
- Implicit default-rate-plan fallback is forbidden in core and API mutation paths.
- Reintroduction of `PricingBaseRate` or `EffectivePricing` (V1 schema/runtime) is forbidden.
- Search read paths cannot trigger write-side healing/materialization.

## Enforcement suite

Architecture invariants are enforced by guardrails in `tests/guardrails/`, including:

- `pricing-v1-runtime-guardrail.test.ts`
- `no-pricing-fallback-runtime.test.ts`
- `no-manual-occupancy-key.test.ts`
- `no-read-path-side-effects.test.ts`
- `source-version-occupancy-aware-guardrail.test.ts`
- `no-variant-first-pricing-mutations.test.ts`
- `no-search-runtime-side-effects.test.ts`
- `hold-occupancy-detail-contract.test.ts`
- `no-default-rateplan-fallback-in-pricing-mutations.test.ts`
- `no-pricing-v1-schema-runtime.test.ts`
- `no-pricing-variant-core-fallback.test.ts`

Any guardrail failure blocks CI and indicates architecture regression.
