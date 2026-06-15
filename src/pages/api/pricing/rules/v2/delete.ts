import type { APIRoute } from "astro"

import {
	deleteCommercialRule,
	getCommercialPriceRule,
} from "@/lib/commercial-rules/commercialRulesRepository"
import {
	listRulesByRatePlan,
	toDateOnly,
	addDays,
	isValidDateOnly,
	readRequestPayload,
	requireText,
	resolveCoverageOccupancy,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"

function readRuleRange(rule: { dateRangeJson?: unknown }) {
	const dateRange =
		rule.dateRangeJson && typeof rule.dateRangeJson === "object"
			? (rule.dateRangeJson as { from?: unknown; to?: unknown })
			: null
	const from = String(dateRange?.from ?? "").trim()
	const to = String(dateRange?.to ?? "").trim()
	if (isValidDateOnly(from) && isValidDateOnly(to) && to >= from) {
		const toDate = new Date(`${to}T00:00:00.000Z`)
		toDate.setUTCDate(toDate.getUTCDate() + 1)
		return { from, to: toDateOnly(toDate) }
	}
	if (isValidDateOnly(from)) {
		const fromDate = new Date(`${from}T00:00:00.000Z`)
		return { from, to: toDateOnly(addDays(fromDate, 60)) }
	}
	const today = new Date()
	today.setUTCHours(0, 0, 0, 0)
	return { from: toDateOnly(today), to: toDateOnly(addDays(today, 60)) }
}

export const POST: APIRoute = async ({ request }) => {
	const payload = await readRequestPayload(request)
	const ratePlanId = requireText(payload, "ratePlanId")
	const ruleId = requireText(payload, "ruleId")
	if (!ratePlanId || !ruleId) {
		return new Response(JSON.stringify({ error: "ratePlanId_and_ruleId_required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const context = await resolveOwnedRatePlanContext(request, ratePlanId)
	if (!context.ok) return context.response
	const rule = await getCommercialPriceRule({ ruleId, ratePlanId })
	if (!rule) {
		return new Response(JSON.stringify({ error: "rule_not_found_for_ratePlan" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	await deleteCommercialRule(ruleId)

	const stillThere = await getCommercialPriceRule({ ruleId, ratePlanId })
	if (stillThere?.id) {
		return new Response(JSON.stringify({ error: "rule_delete_not_confirmed" }), {
			status: 409,
			headers: { "Content-Type": "application/json" },
		})
	}

	const range = readRuleRange(rule)
	let rematerialization: unknown = null
	let rematerializationWarning: string | null = null
	try {
		rematerialization = await ensurePricingCoverageRuntime({
			variantId: context.ownerContext.variantId,
			ratePlanId,
			from: range.from,
			to: range.to,
			recomputeExisting: true,
			occupancy: resolveCoverageOccupancy((rule as any).occupancyKey),
		})
	} catch (error) {
		rematerializationWarning =
			error instanceof Error ? error.message : "pricing_rematerialization_failed_after_delete"
	}

	return new Response(
		JSON.stringify({
			ok: true,
			ruleId,
			ratePlanId,
			rematerializationRange: range,
			rematerialization,
			rematerializationWarning,
			rules: await listRulesByRatePlan(ratePlanId),
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
