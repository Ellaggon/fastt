import { RatePlanEngine } from "../../domain/rate-plans/RatePlanEngine"
import { selectBestRatePlan } from "../use-cases/select-best-rateplan"
import type { PriceRuleRepositoryPort } from "../ports/PriceRuleRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"
import type { VariantRepositoryPort } from "../ports/VariantRepositoryPort"

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
