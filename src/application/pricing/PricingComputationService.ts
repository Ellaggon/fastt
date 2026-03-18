import { PricingEngine } from "@/core/pricing/PricingEngine"
import { PricingRepository } from "@/repositories/PricingRepository"

export class PricingComputationService {
	constructor(
		private pricingRepo: PricingRepository,
		private pricingEngine: PricingEngine
	) {}

	async computeAndPersist(params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
	}) {
		const rules = await this.pricingRepo.getRules(params.ratePlanId)

		const result = this.pricingEngine.computeDaily({
			basePrice: params.basePrice,
			rules,
			currency: "USD",
		})

		await this.pricingRepo.saveEffectivePrice({
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			date: params.date,
			basePrice: params.basePrice,
			finalBasePrice: result.total,
		})
	}
}
