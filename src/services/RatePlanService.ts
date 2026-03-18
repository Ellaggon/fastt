import { VariantRepository } from "@/repositories/VariantRepository"
import { RatePlanEngine } from "@/core/rate-plans/RatePlanEngine"

export class RatePlanService {
	constructor(
		private variantRepo = new VariantRepository(),
		private ratePlanEngine = new RatePlanEngine()
	) {}

	async getAvailableRatePlans(variantId: string, checkIn: Date, checkOut: Date) {
		const variant = await this.variantRepo.getById(variantId)

		if (!variant) {
			throw new Error("Variant not found")
		}

		return this.ratePlanEngine.select({
			variantId: variant.id,
			basePrice: variant.basePrice ?? 0,
			checkIn,
			checkOut,
		})
	}
}
