// Public API for the search module.
// External consumers MUST import from "@/modules/search/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain types
export * from "./domain/unit.types"
export * from "./domain/pricing.types"
export * from "./domain/restrictions.types"
export * from "./domain/promotions.types"

// Application
export * from "./application/SearchContextLoader"
export * from "./application/SearchPipeline"
export * from "./application/use-cases/build-offers"
export * from "./application/ports/AdapterRegistryPort"
export * from "./application/ports/PricingPort"
export * from "./application/ports/PromotionPort"
export * from "./application/ports/RestrictionPort"
export * from "./application/ports/SellableUnitAdapterPort"
export * from "./application/ports/VariantQueryPort"
