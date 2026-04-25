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
export * from "./application/use-cases/resolve-search-offers"
export * from "./application/use-cases/new-search-strategy"
export * from "./application/use-cases/materialize-search-unit"
export * from "./application/queries/search.normalizer"
export * from "./application/queries/build-search-comparison-summary"
export * from "./application/queries/search.types"
export { buildOccupancyKey } from "./domain/occupancy-key"
export {
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
	type StaySellabilityEvaluation,
} from "./application/queries/evaluate-stay-from-view"
export * from "./application/dto/SearchSellabilityDTO"
export * from "./application/ports/SearchEnginePort"
export * from "./application/adapters/CanonicalSearchAdapter"
export * from "./application/adapters/NewSearchPipelineAdapter"
export * from "./application/services/SearchRuntimeOrchestrator"
export * from "./application/services/classifySearchMismatch"
export * from "./application/services/search-engine-health"
export * from "./application/ports/AdapterRegistryPort"
export * from "./application/ports/PromotionPort"
export * from "./application/ports/RestrictionPort"
export * from "./application/ports/SellableUnitAdapterPort"
export * from "./application/ports/VariantQueryPort"
