import { VariantRepository } from "@/repositories/VariantRepository"
import { RatePlanEngine } from "@/core/rate-plans/RatePlanEngine"
import { PriceRuleRepository } from "@/repositories/PriceRuleRepository"
import { RatePlanRepository } from "@/repositories/RatePlanRepository"
import { selectBestRatePlan } from "@/modules/pricing/application/use-cases/select-best-rateplan"

export class RatePlanService {
	constructor(
		private variantRepo = new VariantRepository(),
		private ratePlanEngine = new RatePlanEngine(),
		private ratePlanRepo = new RatePlanRepository(),
		private priceRuleRepo = new PriceRuleRepository()
	) {}

	async getAvailableRatePlans(variantId: string, checkIn: Date, checkOut: Date) {
		const { candidates } = await selectBestRatePlan(
			{
				variantRepo: this.variantRepo,
				ratePlanRepo: this.ratePlanRepo,
				priceRuleRepo: this.priceRuleRepo,
				ratePlanEngine: this.ratePlanEngine,
			},
			{ variantId, checkIn, checkOut }
		)

		return candidates
	}
}
