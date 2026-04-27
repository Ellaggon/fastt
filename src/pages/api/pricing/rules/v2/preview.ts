import type { APIRoute } from "astro"
import { evaluatePricingRules } from "@/modules/pricing/public"
import { variantManagementRepository } from "@/container"

import {
	listRulesByRatePlan,
	normalizeRuleType,
	optionalText,
	parseDayOfWeek,
	parseNumber,
	readRequestPayload,
	requireText,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"

export const POST: APIRoute = async ({ request }) => {
	const payload = await readRequestPayload(request)
	const ratePlanId = requireText(payload, "ratePlanId")
	if (!ratePlanId) {
		return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const context = await resolveOwnedRatePlanContext(request, ratePlanId)
	if (!context.ok) return context.response

	const baseRate = await variantManagementRepository.getBaseRate(context.ownerContext.variantId)
	if (!baseRate) {
		return new Response(JSON.stringify({ error: "pricing_missing" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const type = normalizeRuleType(requireText(payload, "type"))
	const value = parseNumber(payload, "value", Number.NaN)
	if (!Number.isFinite(value)) {
		return new Response(JSON.stringify({ error: "invalid_value" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const priority = parseNumber(payload, "priority", 10)
	const dateFrom = optionalText(payload, "dateFrom")
	const dateTo = optionalText(payload, "dateTo")
	const dayOfWeek = parseDayOfWeek(optionalText(payload, "dayOfWeek"))
	const previewFrom = optionalText(payload, "previewFrom") ?? new Date().toISOString().slice(0, 10)
	const previewDaysRaw = parseNumber(payload, "previewDays", 30)
	const previewDays = Math.min(Math.max(Math.trunc(previewDaysRaw), 1), 120)
	const start = new Date(`${previewFrom}T00:00:00.000Z`)
	const end = new Date(start)
	end.setUTCDate(start.getUTCDate() + previewDays)

	const rules = (await listRulesByRatePlan(ratePlanId)).map((rule) => ({
		id: rule.id,
		type: normalizeRuleType(rule.type),
		value: Number(rule.value),
		priority: Number(rule.priority),
		dateRange:
			rule.dateFrom || rule.dateTo
				? { from: rule.dateFrom ?? undefined, to: rule.dateTo ?? undefined }
				: null,
		dayOfWeek: rule.dayOfWeek,
		createdAt: new Date(rule.createdAt),
		isActive: true,
	}))
	const candidateRule = {
		id: "__candidate__",
		type,
		value,
		priority,
		dateRange: dateFrom || dateTo ? { from: dateFrom ?? undefined, to: dateTo ?? undefined } : null,
		dayOfWeek: dayOfWeek ?? null,
		createdAt: new Date(),
		isActive: true,
	}
	const days: Array<{
		date: string
		before: number
		after: number
		delta: number
		appliedRuleIds: string[]
	}> = []
	const cursor = new Date(start)
	while (cursor < end) {
		const date = cursor.toISOString().slice(0, 10)
		const beforeEval = evaluatePricingRules({
			basePrice: Number(baseRate.basePrice),
			date,
			ratePlanId,
			rules,
		})
		const afterEval = evaluatePricingRules({
			basePrice: Number(baseRate.basePrice),
			date,
			ratePlanId,
			rules: [...rules, candidateRule],
		})
		days.push({
			date,
			before: Number(beforeEval.price),
			after: Number(afterEval.price),
			delta: Number((afterEval.price - beforeEval.price).toFixed(2)),
			appliedRuleIds: afterEval.appliedRuleIds,
		})
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}

	return new Response(
		JSON.stringify({
			basePrice: Number(baseRate.basePrice),
			currency: String(baseRate.currency),
			ratePlanId,
			days,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
