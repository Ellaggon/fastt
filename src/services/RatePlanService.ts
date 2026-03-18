import { RatePlanEngine } from "@/core/rate-plans/RatePlanEngine"
import { selectBestRatePlan } from "@/modules/pricing/application/use-cases/select-best-rateplan"
import type { PriceRuleRepositoryPort } from "@/modules/pricing/application/ports/PriceRuleRepositoryPort"
import type { RatePlanRepositoryPort } from "@/modules/pricing/application/ports/RatePlanRepositoryPort"
import type { VariantRepositoryPort } from "@/modules/pricing/application/ports/VariantRepositoryPort"

export class RatePlanService {
	constructor(
		private deps: {
			variantRepo: VariantRepositoryPort
			ratePlanEngine: RatePlanEngine
			ratePlanRepo: RatePlanRepositoryPort
			priceRuleRepo: PriceRuleRepositoryPort
		}
	) {}

	async getAvailableRatePlans(variantId: string, checkIn: Date, checkOut: Date) {
		const { candidates } = await selectBestRatePlan(
			{
				variantRepo: this.deps.variantRepo,
				ratePlanRepo: this.deps.ratePlanRepo,
				priceRuleRepo: this.deps.priceRuleRepo,
				ratePlanEngine: this.deps.ratePlanEngine,
			},
			{ variantId, checkIn, checkOut }
		)

		return candidates
	}
}
