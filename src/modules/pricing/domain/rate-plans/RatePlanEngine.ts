import { applyPriceRules } from "./ratePlan.price"
import { computeRatePlanPriority } from "./ratePlan.priority"

export class RatePlanEngine {
	selectFromMemory(ctx: {
		ratePlans: any[]
		priceRules: any[][]
		basePrice: number
		checkIn: Date
	}) {
		const results = ctx.ratePlans.map((rp, i) => {
			const rules = ctx.priceRules[i] ?? []

			const price = applyPriceRules(ctx.basePrice, rules, ctx.checkIn)

			return {
				id: rp.id,
				name: rp.template?.name ?? "",
				price,
				priority: computeRatePlanPriority(rp, rules),
			}
		})

		return results.sort((a, b) => b.priority - a.priority)
	}
}
