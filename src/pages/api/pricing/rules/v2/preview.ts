import type { APIRoute } from "astro"
import { evaluatePricingRules } from "@/modules/pricing/public"
import { pricingV2Repository, ratePlanPricingReadRepository } from "@/container"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

import {
	buildDateRangeJson,
	listRulesByRatePlan,
	normalizeRuleType,
	normalizeOccupancyKey,
	optionalText,
	parseDayOfWeek,
	parsePricingRuleEligibility,
	parseNumber,
	readRequestPayload,
	readPricingRuleEligibility,
	requireText,
	resolveOwnedRatePlanContext,
	validatePricingRuleEligibility,
} from "@/lib/pricing/rules-v2"
import { evaluatePricingRuleEligibility } from "@/modules/pricing/public"

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

	const type = normalizeRuleType(requireText(payload, "type"))
	const fallbackCurrency = (optionalText(payload, "currency") ?? "USD").toUpperCase()
	const storedPricingSummary =
		await ratePlanPricingReadRepository.getRatePlanPricingSummary(ratePlanId)
	const pricingSummary =
		storedPricingSummary ??
		(type === "fixed_override"
			? {
					ratePlanId,
					basePrice: 0,
					currency: fallbackCurrency || (await pricingV2Repository.getFallbackCurrency(ratePlanId)),
					effectivePricingDays: 0,
					coverageOccupancyKey: buildOccupancyKey({
						adults: 2,
						children: 0,
						infants: 0,
					}),
				}
			: null)
	if (!pricingSummary) {
		return new Response(JSON.stringify({ error: "pricing_missing" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
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
	const contextKey = optionalText(payload, "contextKey")
	const occupancyKey = normalizeOccupancyKey(optionalText(payload, "occupancyKey") ?? contextKey)
	const eligibility = parsePricingRuleEligibility(payload)
	const eligibilityError = validatePricingRuleEligibility({ contextKey, eligibility })
	if (eligibilityError) {
		return new Response(JSON.stringify({ error: eligibilityError }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const requestDate = optionalText(payload, "requestDate") ?? new Date().toISOString().slice(0, 10)
	const checkIn = optionalText(payload, "checkIn") ?? previewFrom
	const checkOut =
		optionalText(payload, "checkOut") ??
		(() => {
			const parsed = new Date(`${checkIn}T00:00:00.000Z`)
			parsed.setUTCDate(parsed.getUTCDate() + Math.max(1, parseNumber(payload, "nights", 1)))
			return parsed.toISOString().slice(0, 10)
		})()
	const stayContext = {
		requestDate,
		checkIn,
		checkOut,
		nights: parseNumber(payload, "nights", Number.NaN),
	}
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
		occupancyKey: rule.occupancyKey,
		eligibility: rule.eligibility,
		contextKey: rule.contextKey,
		createdAt: new Date(rule.createdAt),
		isActive: true,
	}))
	const candidateRule = {
		id: "__candidate__",
		type,
		value,
		priority,
		dateRange: buildDateRangeJson({ dateFrom, dateTo, eligibility }),
		dayOfWeek: dayOfWeek ?? null,
		occupancyKey: occupancyKey ?? null,
		eligibility,
		contextKey,
		createdAt: new Date(),
		isActive: true,
	}
	const candidateEligibility = evaluatePricingRuleEligibility({
		eligibility: readPricingRuleEligibility(candidateRule.dateRange),
		stayContext,
		ruleLabel: contextKey ?? type,
	})
	const days: Array<{
		date: string
		before: number
		after: number
		delta: number
		appliedRuleIds: string[]
		eligibilityTrace?: unknown[]
	}> = []
	const cursor = new Date(start)
	while (cursor < end) {
		const date = cursor.toISOString().slice(0, 10)
		const beforeEval = evaluatePricingRules({
			basePrice: Number(pricingSummary.basePrice),
			date,
			occupancyKey: occupancyKey ?? null,
			ratePlanId,
			rules,
			stayContext,
			includeEligibilityTrace: true,
		})
		const afterEval = evaluatePricingRules({
			basePrice: Number(pricingSummary.basePrice),
			date,
			occupancyKey: occupancyKey ?? null,
			ratePlanId,
			rules: [...rules, candidateRule],
			stayContext,
			includeEligibilityTrace: true,
		})
		days.push({
			date,
			before: Number(beforeEval.price),
			after: Number(afterEval.price),
			delta: Number((afterEval.price - beforeEval.price).toFixed(2)),
			appliedRuleIds: afterEval.appliedRuleIds,
			eligibilityTrace: afterEval.eligibilityTrace,
		})
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}

	return new Response(
		JSON.stringify({
			basePrice: Number(pricingSummary.basePrice),
			currency: String(pricingSummary.currency),
			ratePlanId,
			occupancyKey: occupancyKey ?? null,
			stayContext,
			candidateEligibility,
			days,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
