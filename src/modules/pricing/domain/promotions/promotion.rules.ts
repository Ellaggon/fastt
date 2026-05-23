import type { Promotion } from "./promotion.types"

export function isPromotionActive(promotion: Promotion, checkIn: Date) {
	return checkIn >= promotion.startDate && checkIn <= promotion.endDate
}

export function canApplyPromotion(
	promotion: Promotion,
	ctx: {
		checkIn: Date
		nights: number
		requestDate?: Date | null
	}
) {
	if (!isPromotionActive(promotion, ctx.checkIn)) return false

	if (promotion.minNights && ctx.nights < promotion.minNights) {
		return false
	}

	if (promotion.daysBeforeCheckIn) {
		if (!ctx.requestDate) return false
		const leadTimeDays = Math.floor(
			(ctx.checkIn.getTime() - ctx.requestDate.getTime()) / (1000 * 60 * 60 * 24)
		)
		if (promotion.type === "early_bird" && leadTimeDays < promotion.daysBeforeCheckIn) {
			return false
		}
		if (promotion.type === "last_minute" && leadTimeDays > promotion.daysBeforeCheckIn) {
			return false
		}
	}

	return true
}
