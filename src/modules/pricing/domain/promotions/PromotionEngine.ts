import { canApplyPromotion } from "./promotion.rules"
import { roundMoney } from "../pricing.utils"
import type { Promotion } from "./promotion.types"

export class PromotionEngine {
	applyPromotions(
		basePrice: number,
		promotions: Promotion[],
		ctx: {
			checkIn: Date
			checkOut: Date
		}
	) {
		const nights = Math.ceil(
			(ctx.checkOut.getTime() - ctx.checkIn.getTime()) / (1000 * 60 * 60 * 24)
		)

		let price = basePrice
		let appliedNonCombinable = false

		for (const promo of promotions) {
			if (!canApplyPromotion(promo, { checkIn: ctx.checkIn, nights })) {
				continue
			}

			if (!promo.combinable && appliedNonCombinable) {
				continue
			}

			price = this.applySinglePromotion(price, promo)

			if (!promo.combinable) {
				appliedNonCombinable = true
			}
		}

		return roundMoney(Math.max(price, 0))
	}

	private applySinglePromotion(price: number, promo: Promotion) {
		switch (promo.type) {
			case "percentage":
				return price * (1 - promo.value / 100)

			case "fixed":
				return price - promo.value

			case "early_bird":
				return price * (1 - promo.value / 100)

			case "last_minute":
				return price * (1 - promo.value / 100)

			default:
				return price
		}
	}
}
