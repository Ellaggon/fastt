// Composition root (manual DI). Centralize wiring here so services and use-cases stay decoupled.

// Pricing infrastructure
import { PricingRepository } from "@/modules/pricing/infrastructure/repositories/PricingRepository"
import { RatePlanRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanRepository"
import { VariantRepository } from "@/modules/pricing/infrastructure/repositories/VariantRepository"
import { PriceRuleRepository } from "@/modules/pricing/infrastructure/repositories/PriceRuleRepository"

// Inventory infrastructure
import { DailyInventoryRepository } from "@/modules/inventory/infrastructure/repositories/DailyInventoryRepository"
import { InventoryRepository } from "@/modules/inventory/infrastructure/repositories/InventoryRepository"

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

// ---- Infrastructure singletons ----
export const pricingRepository = new PricingRepository()
export const ratePlanRepository = new RatePlanRepository()
export const variantRepository = new VariantRepository()
export const priceRuleRepository = new PriceRuleRepository()

export const dailyInventoryRepository = new DailyInventoryRepository()
export const inventoryRepository = new InventoryRepository()

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
