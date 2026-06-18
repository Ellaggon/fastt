import type { APIRoute } from "astro"

import { createCommercialPriceRule } from "@/lib/commercial-rules/commercialRulesRepository"
import {
	isValidDateOnly,
	buildDateRangeJson,
	listRulesByRatePlan,
	normalizeRuleType,
	normalizeOccupancyKey,
	optionalText,
	parseDayOfWeek,
	parsePricingRuleEligibility,
	parseNumber,
	readRequestPayload,
	requireText,
	resolveCoverageOccupancy,
	resolveOwnedRatePlanContext,
	validatePricingRuleEligibility,
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
	const providerId = context.ownerContext.providerId
	if (!providerId) {
		return new Response(JSON.stringify({ error: "provider_not_found" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		})
	}

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
	const fallbackCurrency = optionalText(payload, "currency")?.toUpperCase()
	const eligibility = parsePricingRuleEligibility(payload)
	const eligibilityError = validatePricingRuleEligibility({ contextKey, eligibility })
	if (eligibilityError) {
		return new Response(JSON.stringify({ error: eligibilityError }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
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

	const created = await createCommercialPriceRule({
		providerId,
		ratePlanId,
		name: contextKey ? `ctx:${contextKey}` : null,
		type,
		value,
		priority,
		dateRangeJson: buildDateRangeJson({ dateFrom, dateTo, eligibility }),
		dayOfWeekJson: dayOfWeek ?? null,
		occupancyKey: occupancyKey ?? null,
	})

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
		occupancy: resolveCoverageOccupancy(occupancyKey),
		fallbackCurrency,
	})

	return new Response(
		JSON.stringify({
			ruleId: created.ruleId,
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
