import type { APIRoute } from "astro"
import { pricingRepository, variantManagementRepository } from "@/container"
import { evaluatePricingRules } from "@/modules/pricing/public"

import {
	listRulesByRatePlan,
	optionalText,
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
	const from = optionalText(payload, "from")
	const to = optionalText(payload, "to")
	const days = Math.max(Math.trunc(parseNumber(payload, "days", 60)), 1)

	const dates =
		from && to
			? (() => {
					const start = new Date(`${from}T00:00:00.000Z`)
					const end = new Date(`${to}T00:00:00.000Z`)
					if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
						return [] as string[]
					const out: string[] = []
					const cursor = new Date(start)
					while (cursor < end) {
						out.push(cursor.toISOString().slice(0, 10))
						cursor.setUTCDate(cursor.getUTCDate() + 1)
					}
					return out
				})()
			: (() => {
					const start = new Date()
					start.setUTCHours(0, 0, 0, 0)
					return Array.from({ length: days }).map((_, offset) => {
						const date = new Date(start)
						date.setUTCDate(start.getUTCDate() + offset)
						return date.toISOString().slice(0, 10)
					})
				})()
	if (!dates.length) {
		return new Response(JSON.stringify({ error: "invalid_date_range" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const rules = (await listRulesByRatePlan(ratePlanId)).map((rule) => ({
		id: rule.id,
		type: rule.type,
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
	let writes = 0
	for (const date of dates) {
		const { price } = evaluatePricingRules({
			basePrice: Number(baseRate.basePrice),
			date,
			ratePlanId,
			rules,
		})
		await pricingRepository.saveEffectivePrice({
			variantId: context.ownerContext.variantId,
			ratePlanId,
			date,
			basePrice: Number(baseRate.basePrice),
			finalBasePrice: Number(price),
		})
		writes += 1
	}

	return new Response(
		JSON.stringify({
			ok: true,
			daysGenerated: writes,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
