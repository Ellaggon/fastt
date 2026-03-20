// Composition root (manual DI). Centralize wiring here so services and use-cases stay decoupled.

// Pricing
import {
	adaptPriceRule,
	PricingEngine,
	PromotionEngine,
	RatePlanEngine,
} from "@/modules/pricing/public"
import { PricingRepository } from "@/modules/pricing/infrastructure/repositories/PricingRepository"
import { RatePlanRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanRepository"
import { VariantRepository } from "@/modules/pricing/infrastructure/repositories/VariantRepository"
import { PriceRuleRepository } from "@/modules/pricing/infrastructure/repositories/PriceRuleRepository"
import { RatePlanCommandRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanCommandRepository"

// Inventory
import { DailyInventoryRepository } from "@/modules/inventory/infrastructure/repositories/DailyInventoryRepository"
import { InventoryRepository } from "@/modules/inventory/infrastructure/repositories/InventoryRepository"
import { InventoryBootstrapper } from "@/modules/inventory/infrastructure/services/InventoryBootstrapper"

// Catalog
import { createProduct, createRoom } from "@/modules/catalog/public"
import { RoomRepository } from "@/modules/catalog/infrastructure/repositories/RoomRepository"
import { ProductRepository } from "@/modules/catalog/infrastructure/repositories/ProductRepository"
import { SubtypeRepository } from "@/modules/catalog/infrastructure/repositories/SubtypeRepository"
import { ProviderRepository } from "@/modules/catalog/infrastructure/repositories/ProviderRepository"
import { HotelRoomRepository } from "@/modules/catalog/infrastructure/repositories/HotelRoomRepository"
import { TaxFeeRepository } from "@/modules/catalog/infrastructure/repositories/TaxFeeRepository"
import { CatalogRestrictionRepository } from "@/modules/catalog/infrastructure/repositories/CatalogRestrictionRepository"
import { CancellationPolicyRepository } from "@/modules/catalog/infrastructure/repositories/CancellationPolicyRepository"
import { ProductServiceRepository } from "@/modules/catalog/infrastructure/repositories/ProductServiceRepository"
import { ProductImageRepository } from "@/modules/catalog/infrastructure/repositories/ProductImageRepository"
import { HotelAmenityQueryRepository } from "@/modules/catalog/infrastructure/repositories/HotelAmenityQueryRepository"
import { HotelRoomTypeRepository } from "@/modules/catalog/infrastructure/repositories/HotelRoomTypeRepository"
import { ImageQueryRepository } from "@/modules/catalog/infrastructure/repositories/ImageQueryRepository"
import { ProductServiceQueryRepository } from "@/modules/catalog/infrastructure/repositories/ProductServiceQueryRepository"

import {
	createResolveHotelAmenitiesQuery,
	createResolveHotelTypeQuery,
	createResolveProductImagesQuery,
	createResolveProductServicesQuery,
	createResolveRoomImagesQuery,
} from "@/modules/catalog/application/queries"

// Policies
import { RestrictionRuleEngine } from "@/modules/policies/public"
import { PolicyReadRepository } from "@/modules/policies/infrastructure/repositories/PolicyReadRepository"
import { PolicyCommandRepository } from "@/modules/policies/infrastructure/repositories/PolicyCommandRepository"
import { EffectivePolicyRepository } from "@/modules/policies/infrastructure/repositories/EffectivePolicyRepository"
import { PolicyCache } from "@/modules/policies/infrastructure/cache/policy-cache"
import { createResolveHotelPoliciesQuery } from "@/modules/policies/application/queries"

// Policies (restriction repository)
import { RestrictionRepository } from "@/modules/policies/infrastructure/repositories/RestrictionRepository"
import { DailyInventoryRepository as LegacyDailyInventoryRepository } from "@/repositories/AvailabilityRepository"
import { RatePlanRepository as LegacyRatePlanRepository } from "@/repositories/RatePlanRepository"
import { PriceRuleRepository as LegacyPriceRuleRepository } from "@/repositories/PriceRuleRepository"

// Services (thin orchestration / adapters)
import { AvailabilityService } from "@/modules/inventory/public"
import { InventorySeederService } from "@/modules/inventory/public"
import { RatePlanService } from "@/modules/pricing/public"
import { RestrictionService } from "@/modules/policies/public"
import { PricingComputationService } from "@/modules/pricing/public"

// Search
import {
	BuildOffersUseCase,
	SearchContextLoader,
	SearchPipeline,
	type SearchUnit,
} from "@/modules/search/public"
import type { SearchOffer } from "@/modules/search/public"
import { AdapterRegistry as SearchAdapterRegistry } from "@/modules/search/infrastructure/AdapterRegistry"
import { HotelAdapter } from "@/modules/search/infrastructure/adapters/HotelAdapter"
import { VariantQueryAdapter } from "@/modules/search/infrastructure/adapters/VariantQueryAdapter"
import { PricingPortAdapter } from "@/modules/search/infrastructure/adapters/PricingPortAdapter"
import { PromotionPortAdapter } from "@/modules/search/infrastructure/adapters/PromotionPortAdapter"
import { RestrictionPortAdapter } from "@/modules/search/infrastructure/adapters/RestrictionPortAdapter"

// Policies use-cases
import {
	activatePolicy,
	applyPolicyPreset,
	assignPolicyGroup,
	buildPolicySnapshot,
	createPolicy,
	createPolicyVersion,
	deleteDraftPolicy,
	getPolicy,
	listAssignedPolicies,
	listPolicyHistory,
	resolvePolicies,
	resolvePolicyByHierarchy,
	runPolicyCompiler,
	unassignPolicyGroup,
} from "@/modules/policies/public"

// ---- Infrastructure singletons ----
export const pricingRepository = new PricingRepository()
export const ratePlanRepository = new RatePlanRepository()
export const variantRepository = new VariantRepository()
export const priceRuleRepository = new PriceRuleRepository()
export const ratePlanCommandRepository = new RatePlanCommandRepository()

export const dailyInventoryRepository = new DailyInventoryRepository()
export const inventoryRepository = new InventoryRepository()
export const inventoryBootstrapper = new InventoryBootstrapper()

export const roomRepository = new RoomRepository()
export const productRepository = new ProductRepository()
export const subtypeRepository = new SubtypeRepository()
export const providerRepository = new ProviderRepository()
export const hotelRoomRepository = new HotelRoomRepository()
export const taxFeeRepository = new TaxFeeRepository()
export const catalogRestrictionRepository = new CatalogRestrictionRepository()
export const cancellationPolicyRepository = new CancellationPolicyRepository()
export const productServiceRepository = new ProductServiceRepository()
export const productImageRepository = new ProductImageRepository()
export const hotelAmenityQueryRepository = new HotelAmenityQueryRepository()
export const hotelRoomTypeRepository = new HotelRoomTypeRepository()
export const imageQueryRepository = new ImageQueryRepository()
export const productServiceQueryRepository = new ProductServiceQueryRepository()

export const policyReadRepository = new PolicyReadRepository()
export const policyCommandRepository = new PolicyCommandRepository()
export const effectivePolicyRepository = new EffectivePolicyRepository()
export const policyCache = new PolicyCache<any>()

export const restrictionRepository = new RestrictionRepository()
export const legacyDailyInventoryRepository = new LegacyDailyInventoryRepository()
export const legacyRatePlanRepository = new LegacyRatePlanRepository()
export const legacyPriceRuleRepository = new LegacyPriceRuleRepository()

// ---- Engine singletons ----
export const ratePlanEngine = new RatePlanEngine()
export const pricingEngine = new PricingEngine()
export const restrictionRuleEngine = new RestrictionRuleEngine()
export const promotionEngine = new PromotionEngine()

// ---- Service singletons ----
export const availabilityService = new AvailabilityService(dailyInventoryRepository)
export const inventorySeederService = new InventorySeederService(dailyInventoryRepository)

export const ratePlanService = new RatePlanService({
	variantRepo: variantRepository,
	ratePlanRepo: ratePlanRepository,
	priceRuleRepo: priceRuleRepository,
	ratePlanEngine,
})

export const restrictionService = new RestrictionService({
	repo: restrictionRepository,
	engine: restrictionRuleEngine,
})

export const pricingComputationService = new PricingComputationService(
	pricingRepository,
	pricingEngine
)

// ---- Search singletons ----
export const searchAdapterRegistry = new SearchAdapterRegistry<SearchUnit>()
export const hotelAdapter = new HotelAdapter({
	inventoryRepo: legacyDailyInventoryRepository,
	ratePlanRepo: legacyRatePlanRepository,
	restrictionRepo: restrictionRepository,
	priceRuleRepo: legacyPriceRuleRepository,
})
searchAdapterRegistry.register("hotel_room", hotelAdapter)

export const searchContextLoader = new SearchContextLoader<SearchUnit>(searchAdapterRegistry)

const searchPricingPort = new PricingPortAdapter({
	adaptPriceRule,
	pricingEngine,
})
const searchRestrictionPort = new RestrictionPortAdapter({
	restrictionEngine: restrictionRuleEngine,
})
const searchPromotionPort = new PromotionPortAdapter({
	promotionEngine,
})

export const searchPipeline = new SearchPipeline<SearchUnit>(searchContextLoader, undefined, {
	restrictions: searchRestrictionPort,
	pricing: searchPricingPort,
	promotions: searchPromotionPort,
})

export const variantQueryAdapter = new VariantQueryAdapter<SearchUnit>(variantRepository)
export const buildOffers = new BuildOffersUseCase<SearchUnit>({
	variantQuery: variantQueryAdapter,
	searchPipeline,
})

// Legacy global query moved here: container is the single composition root.
export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
}): Promise<SearchOffer<SearchUnit>[]> {
	return buildOffers.execute(params)
}

export async function createRoomUseCase(params: Parameters<typeof createRoom>[1]) {
	return createRoom({ roomRepo: roomRepository, inventoryBootstrap: inventoryBootstrapper }, params)
}

export async function createProductUseCase(params: Parameters<typeof createProduct>[1]) {
	return createProduct({ repo: productRepository }, params)
}

// ---- Catalog / Policies (wired read queries) ----
export const resolveHotelAmenities = createResolveHotelAmenitiesQuery({
	repo: hotelAmenityQueryRepository,
})
export const resolveHotelType = createResolveHotelTypeQuery({ repo: hotelRoomTypeRepository })
export const resolveProductImages = createResolveProductImagesQuery({
	repo: productImageRepository,
})
export const resolveProductServices = createResolveProductServicesQuery({
	repo: productServiceQueryRepository,
})
export const resolveRoomImages = createResolveRoomImagesQuery({ repo: imageQueryRepository })

export const resolveHotelPolicies = createResolveHotelPoliciesQuery({
	repo: effectivePolicyRepository,
})

// ---- Policies (wired use-cases) ----
export async function resolvePoliciesUseCase(params: Parameters<typeof resolvePolicies>[1]) {
	return resolvePolicies({ queryRepo: policyReadRepository, cache: policyCache }, params)
}

export async function resolvePolicyByHierarchyUseCase(params: {
	category: string
	entityType: string
	entityId: string
}) {
	return resolvePolicyByHierarchy({ queryRepo: policyReadRepository }, params)
}

export async function buildPolicySnapshotUseCase(params: { entityType: string; entityId: string }) {
	return buildPolicySnapshot(
		{ effectivePolicyRepo: effectivePolicyRepository, queryRepo: policyReadRepository },
		params
	)
}

export async function runPolicyCompilerUseCase(entityType: string, entityId: string) {
	return runPolicyCompiler(
		{
			effectivePolicyRepo: effectivePolicyRepository,
			queryRepo: policyReadRepository,
			cache: policyCache,
		},
		{ entityType, entityId }
	)
}

export async function getPolicyUseCase(policyId: string) {
	return getPolicy({ queryRepo: policyReadRepository }, { policyId })
}

export async function listAssignedPoliciesUseCase(scopeId: string, category?: string | null) {
	return listAssignedPolicies({ queryRepo: policyReadRepository }, { scopeId, category })
}

export async function assignPolicyGroupUseCase(groupId: string, scopeId: string) {
	return assignPolicyGroup({ commandRepo: policyCommandRepository }, { groupId, scopeId })
}

export async function unassignPolicyGroupUseCase(groupId: string, scopeId: string) {
	return unassignPolicyGroup({ commandRepo: policyCommandRepository }, { groupId, scopeId })
}

export async function activatePolicyUseCase(policyId: string, effectiveFrom?: string) {
	return activatePolicy(
		{
			commandRepo: policyCommandRepository,
			queryRepo: policyReadRepository,
			runPolicyCompiler: runPolicyCompilerUseCase,
		},
		{ policyId, effectiveFrom }
	)
}

export async function createPolicyUseCase(params: Parameters<typeof createPolicy>[1]) {
	return createPolicy({ commandRepo: policyCommandRepository }, params)
}

export async function deleteDraftPolicyUseCase(policyId: string) {
	return deleteDraftPolicy({ commandRepo: policyCommandRepository }, { policyId })
}

export async function createPolicyVersionUseCase(
	params: Parameters<typeof createPolicyVersion>[1]
) {
	return createPolicyVersion({ commandRepo: policyCommandRepository }, params)
}

export async function applyPolicyPresetUseCase(policyId: string, presetKey: string) {
	return applyPolicyPreset(
		{ commandRepo: policyCommandRepository, queryRepo: policyReadRepository },
		{ policyId, presetKey }
	)
}

export async function listPolicyHistoryUseCase(groupId: string) {
	return listPolicyHistory({ queryRepo: policyReadRepository }, { groupId })
}
