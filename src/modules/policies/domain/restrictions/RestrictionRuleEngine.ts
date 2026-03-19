import { resolveConflicts } from "./restrictions.conflicts"

import type { RestrictionRow, RestrictionContext, RestrictionResult } from "./restrictions.types"

export class RestrictionRuleEngine {
	resolve(ctx: RestrictionContext, rules: RestrictionRow[]): RestrictionResult {
		const ordered = [...rules].sort(
			(a: RestrictionRow, b: RestrictionRow) => (a.priority ?? 999) - (b.priority ?? 999)
		)

		const cleanRules = resolveConflicts(ordered)

		const reasons: string[] = []
		const now = Date.now()
		const checkInDay = ctx.checkIn.getDay() === 0 ? 7 : ctx.checkIn.getDay()

		for (const rule of cleanRules) {
			if (rule.validDays?.length && !rule.validDays.includes(checkInDay)) continue

			switch (rule.type) {
				case "stop_sell":
					return { allowed: false, reason: "Venta cerrada" }
				// return { allowed: false, stopSell: true }

				case "min_los":
					if (ctx.nights < rule.value!) reasons.push(`Mínimo ${rule.value} noches`)
					break

				case "min_lead_time": {
					const days = (ctx.checkIn.getTime() - now) / 86400000
					if (days < rule.value!) reasons.push(`Anticipación mínima ${rule.value} días`)
					break
				}

				case "max_lead_time": {
					const days = (ctx.checkIn.getTime() - now) / 86400000
					if (days > rule.value!) reasons.push(`Anticipación máxima ${rule.value} días`)
					break
				}
			}
		}

		return reasons.length ? { allowed: false, reason: reasons.join(", ") } : { allowed: true }
	}

	preview(ctx: RestrictionContext, newRule: RestrictionRow, allRules: RestrictionRow[]) {
		const blockedDates: string[] = []

		const current = new Date(newRule.startDate)
		const end = new Date(newRule.endDate)

		while (current <= end) {
			const result = this.resolve(
				{
					...ctx,
					checkIn: new Date(current),
					checkOut: new Date(current.getTime() + 86400000),
					nights: 1,
				},
				[...allRules, newRule]
			)

			if (!result.allowed) blockedDates.push(current.toISOString().split("T")[0])

			current.setDate(current.getDate() + 1)
		}

		return blockedDates
	}
	evaluateFromMemory(ctx: {
		restrictions: RestrictionRow[]
		checkIn: Date
		checkOut: Date
		nights: number
	}) {
		return this.resolve(
			{
				productId: "",
				variantId: "",
				ratePlanId: "",
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
				nights: ctx.nights,
			},
			ctx.restrictions
		)
	}
}
