import type { Promotion } from "../../domain/promotions.types"

export interface PromotionPort {
	applyPromotions(
		basePrice: number,
		promotions: Promotion[],
		ctx: {
			checkIn: Date
			checkOut: Date
		}
	): number
}
