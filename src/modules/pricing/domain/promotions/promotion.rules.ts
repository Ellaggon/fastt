import type { Promotion } from "./promotion.types"

export function isPromotionActive(promotion: Promotion, checkIn: Date) {
	return checkIn >= promotion.startDate && checkIn <= promotion.endDate
}

export function canApplyPromotion(
	promotion: Promotion,
	ctx: {
		checkIn: Date
		nights: number
	}
) {
	if (!isPromotionActive(promotion, ctx.checkIn)) return false

	if (promotion.minNights && ctx.nights < promotion.minNights) {
		return false
	}

	return true
}
