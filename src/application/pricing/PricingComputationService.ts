import { PricingEngine } from "@/modules/pricing/domain/PricingEngine"
import { PricingRepository } from "@/repositories/PricingRepository"
import { computeAndPersistDailyPrice } from "@/modules/pricing/application/use-cases/compute-and-persist-daily-price"

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
		return computeAndPersistDailyPrice(
			{ pricingRepo: this.pricingRepo, pricingEngine: this.pricingEngine },
			params
		)
	}
}
