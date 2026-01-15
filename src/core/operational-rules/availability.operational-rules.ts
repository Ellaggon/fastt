import { db, OperatingRule } from "astro:db"
import { and, eq, lte, gte } from "astro:db"
import type { OperationalRuleParamsMap } from "./operational-rules.types"
import { isKnownPreset } from "./operational-rules.guards"

function getParams<K extends keyof OperationalRuleParamsMap>(rule: {
	presetKey: K
	params: unknown
}): OperationalRuleParamsMap[K] {
	return rule.params as OperationalRuleParamsMap[K]
}

export type OperationalRuleContext = {
	productId: string
	roomTypeId?: string
	ratePlanId?: string
	checkIn: Date
	checkOut: Date
	nights: number
}

export type OperationalRuleResult = { allowed: true } | { allowed: false; reason: string }

export async function resolveOperationalRules(
	ctx: OperationalRuleContext
): Promise<OperationalRuleResult> {
	const rules = await db
		.select()
		.from(OperatingRule)
		.where(
			and(
				eq(OperatingRule.productId, ctx.productId),
				eq(OperatingRule.enabled, true),
				lte(OperatingRule.dateFrom, ctx.checkOut),
				gte(OperatingRule.dateTo, ctx.checkIn)
			)
		)
		.orderBy(OperatingRule.priority)

	const reasons: string[] = []

	for (const rule of rules) {
		// 🎯 Scope filtering
		if (rule.scope === "room_type" && rule.scopeId !== ctx.roomTypeId) continue
		if (rule.scope === "rate_plan" && rule.scopeId !== ctx.ratePlanId) continue

		if (!isKnownPreset(rule.presetKey)) continue

		// 🔴 HARD BLOCK
		if (rule.presetKey === "stop_sell") {
			return { allowed: false, reason: "Stop Sell activo" }
		}

		// 🟡 Min LOS
		if (rule.presetKey === "min_los") {
			const params = getParams({
				presetKey: "min_los",
				params: rule.params,
			})

			if (ctx.nights < params.nights) {
				reasons.push(`Min LOS ${params.nights}`)
			}
		}

		// 🟡 Booking window
		if (rule.presetKey === "booking_window") {
			const params = getParams({
				presetKey: "booking_window",
				params: rule.params,
			})

			const { minDays, maxDays } = params
			// aquí validas
		}
	}

	if (reasons.length > 0) {
		return { allowed: false, reason: reasons.join(", ") }
	}

	return { allowed: true }
}
