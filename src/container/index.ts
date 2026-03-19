// Composition root (manual DI). Centralize wiring here so services and use-cases stay decoupled.

// Pricing infrastructure
import { PricingRepository } from "@/modules/pricing/infrastructure/repositories/PricingRepository"
import { RatePlanRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanRepository"
import { VariantRepository } from "@/modules/pricing/infrastructure/repositories/VariantRepository"
import { PriceRuleRepository } from "@/modules/pricing/infrastructure/repositories/PriceRuleRepository"
import { RatePlanCommandRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanCommandRepository"

// Inventory infrastructure
import { DailyInventoryRepository } from "@/modules/inventory/infrastructure/repositories/DailyInventoryRepository"
import { InventoryRepository } from "@/modules/inventory/infrastructure/repositories/InventoryRepository"
import { InventoryBootstrapper } from "@/modules/inventory/infrastructure/services/InventoryBootstrapper"

// Catalog infrastructure
import { RoomRepository } from "@/modules/catalog/infrastructure/repositories/RoomRepository"
import { ProductRepository } from "@/modules/catalog/infrastructure/repositories/ProductRepository"
import { SubtypeRepository } from "@/modules/catalog/infrastructure/repositories/SubtypeRepository"
import { ProviderRepository } from "@/modules/catalog/infrastructure/repositories/ProviderRepository"
import { HotelRoomRepository } from "@/modules/catalog/infrastructure/repositories/HotelRoomRepository"

// Policies infrastructure
import { PolicyReadRepository } from "@/modules/policies/infrastructure/repositories/PolicyReadRepository"
import { PolicyCommandRepository } from "@/modules/policies/infrastructure/repositories/PolicyCommandRepository"
import { EffectivePolicyRepository } from "@/modules/policies/infrastructure/repositories/EffectivePolicyRepository"
import { PolicyCache } from "@/modules/policies/infrastructure/cache/policy-cache"

// Domain engines / pure components
import { RatePlanEngine } from "@/core/rate-plans/RatePlanEngine"
import { PricingEngine } from "@/core/pricing/PricingEngine"
import { RestrictionRuleEngine } from "@/core/restrictions/RestrictionRuleEngine"

// Legacy repositories not yet migrated behind module infrastructure
import { RestrictionRepository } from "@/repositories/RestrictionRepository"

// Services (thin orchestration / adapters)
import { AvailabilityService } from "@/services/AvailabilityServices"
import { InventorySeederService } from "@/services/InventorySeederService"
import { RatePlanService } from "@/services/RatePlanService"
import { RestrictionService } from "@/services/RestrictionService"
import { PricingComputationService } from "@/application/pricing/PricingComputationService"
import { createRoom } from "@/modules/catalog/application/use-cases/create-room"
import { createProduct } from "@/modules/catalog/application/use-cases/create-product"

// Policies use-cases
import { resolvePolicies } from "@/modules/policies/application/use-cases/resolve-policies"
import { resolvePolicyByHierarchy } from "@/modules/policies/application/use-cases/resolve-policy-by-hierarchy"
import { buildPolicySnapshot } from "@/modules/policies/application/use-cases/build-policy-snapshot"
import { runPolicyCompiler } from "@/modules/policies/application/use-cases/run-policy-compiler"
import { getPolicy } from "@/modules/policies/application/use-cases/get-policy"
import { listAssignedPolicies } from "@/modules/policies/application/use-cases/list-assigned-policies"
import { assignPolicyGroup } from "@/modules/policies/application/use-cases/assign-policy-group"
import { unassignPolicyGroup } from "@/modules/policies/application/use-cases/unassign-policy-group"
import { activatePolicy } from "@/modules/policies/application/use-cases/activate-policy"
import { createPolicy } from "@/modules/policies/application/use-cases/create-policy"
import { deleteDraftPolicy } from "@/modules/policies/application/use-cases/delete-draft-policy"
import { createPolicyVersion } from "@/modules/policies/application/use-cases/create-policy-version"
import { applyPolicyPreset } from "@/modules/policies/application/use-cases/apply-policy-preset"
import { listPolicyHistory } from "@/modules/policies/application/use-cases/list-policy-history"

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

export const policyReadRepository = new PolicyReadRepository()
export const policyCommandRepository = new PolicyCommandRepository()
export const effectivePolicyRepository = new EffectivePolicyRepository()
export const policyCache = new PolicyCache<any>()

export const restrictionRepository = new RestrictionRepository()

// ---- Engine singletons ----
export const ratePlanEngine = new RatePlanEngine()
export const pricingEngine = new PricingEngine()
export const restrictionRuleEngine = new RestrictionRuleEngine()

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

export async function createRoomUseCase(params: Parameters<typeof createRoom>[1]) {
	return createRoom({ roomRepo: roomRepository, inventoryBootstrap: inventoryBootstrapper }, params)
}

export async function createProductUseCase(params: Parameters<typeof createProduct>[1]) {
	return createProduct({ repo: productRepository }, params)
}

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
