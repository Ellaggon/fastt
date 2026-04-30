import type { APIRoute } from "astro"
import { randomUUID } from "node:crypto"
import { db, PriceRule } from "astro:db"

import {
	isValidDateOnly,
	listRulesByRatePlan,
	normalizeRuleType,
	normalizeOccupancyKey,
	optionalText,
	parseDayOfWeek,
	parseNumber,
	readRequestPayload,
	requireText,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"

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

	const typeRaw = requireText(payload, "type")
	const type = normalizeRuleType(typeRaw)
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
	const contextKey = optionalText(payload, "contextKey")
	const occupancyKey = normalizeOccupancyKey(optionalText(payload, "occupancyKey") ?? contextKey)
	if (dateFrom && !isValidDateOnly(dateFrom)) {
		return new Response(JSON.stringify({ error: "invalid_date_from" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	if (dateTo && !isValidDateOnly(dateTo)) {
		return new Response(JSON.stringify({ error: "invalid_date_to" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	if (dateFrom && dateTo && dateTo < dateFrom) {
		return new Response(JSON.stringify({ error: "invalid_date_range" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const createdAt = new Date()
	const ruleId = randomUUID()
	await db.insert(PriceRule).values({
		id: ruleId,
		ratePlanId,
		name: contextKey ? `ctx:${contextKey}` : null,
		type,
		value,
		priority,
		dateRangeJson: dateFrom || dateTo ? { from: dateFrom ?? null, to: dateTo ?? null } : null,
		dayOfWeekJson: dayOfWeek ?? null,
		isActive: true,
		createdAt,
		...(occupancyKey ? ({ occupancyKey } as any) : {}),
	} as any)

	const rematerializationFrom = dateFrom ?? new Date().toISOString().slice(0, 10)
	const rematerializationTo = dateTo
		? (() => {
				const toDate = new Date(`${dateTo}T00:00:00.000Z`)
				toDate.setUTCDate(toDate.getUTCDate() + 1)
				return toDate.toISOString().slice(0, 10)
			})()
		: (() => {
				const fromDate = new Date(`${rematerializationFrom}T00:00:00.000Z`)
				fromDate.setUTCDate(fromDate.getUTCDate() + 60)
				return fromDate.toISOString().slice(0, 10)
			})()
	const rematerialization = await ensurePricingCoverageRuntime({
		variantId: context.ownerContext.variantId,
		ratePlanId,
		from: rematerializationFrom,
		to: rematerializationTo,
		recomputeExisting: true,
	})

	return new Response(
		JSON.stringify({
			ruleId,
			ratePlanId,
			rematerialization,
			rules: await listRulesByRatePlan(ratePlanId),
		}),
		{
			status: 201,
			headers: { "Content-Type": "application/json" },
		}
	)
}
