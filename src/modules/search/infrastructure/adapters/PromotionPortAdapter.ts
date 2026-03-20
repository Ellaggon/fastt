import type { PromotionPort } from "../../application/ports/PromotionPort"
import type { Promotion } from "../../domain/promotions.types"

export class PromotionPortAdapter implements PromotionPort {
	constructor(
		private deps: {
			promotionEngine: {
				applyPromotions(
					basePrice: number,
					promotions: Promotion[],
					ctx: { checkIn: Date; checkOut: Date }
				): number
			}
		}
	) {}

	applyPromotions(
		basePrice: number,
		promotions: Promotion[],
		ctx: { checkIn: Date; checkOut: Date }
	) {
		return this.deps.promotionEngine.applyPromotions(basePrice, promotions, ctx)
	}
}
