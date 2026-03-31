import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import { computeAndPersistDailyPrice } from "../use-cases/compute-and-persist-daily-price"
import type { PricingEngine } from "../../domain/PricingEngine"

export class PricingComputationService {
	constructor(
		private pricingRepo: PricingRepositoryPort,
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
