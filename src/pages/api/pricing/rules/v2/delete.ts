import type { APIRoute } from "astro"
import { db, eq, PriceRule } from "astro:db"

import {
	ensureRuleBelongsToRatePlan,
	listRulesByRatePlan,
	toDateOnly,
	addDays,
	readRequestPayload,
	requireText,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"

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
	const belongs = await ensureRuleBelongsToRatePlan(ruleId, ratePlanId)
	if (!belongs) {
		return new Response(JSON.stringify({ error: "rule_not_found_for_ratePlan" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	await db.delete(PriceRule).where(eq(PriceRule.id, ruleId))

	const today = new Date()
	today.setUTCHours(0, 0, 0, 0)
	const rematerialization = await ensurePricingCoverageRuntime({
		variantId: context.ownerContext.variantId,
		ratePlanId,
		from: toDateOnly(today),
		to: toDateOnly(addDays(today, 60)),
		recomputeExisting: true,
	})

	return new Response(
		JSON.stringify({
			ok: true,
			ruleId,
			ratePlanId,
			rematerialization,
			rules: await listRulesByRatePlan(ratePlanId),
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
