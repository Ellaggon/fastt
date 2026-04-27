import type { APIRoute } from "astro"

import { listRulesByRatePlan, resolveOwnedRatePlanContext } from "@/lib/pricing/rules-v2"

export const GET: APIRoute = async ({ request, url }) => {
	const ratePlanId = String(url.searchParams.get("ratePlanId") ?? "").trim()
	if (!ratePlanId) {
		return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const context = await resolveOwnedRatePlanContext(request, ratePlanId)
	if (!context.ok) return context.response
	return new Response(
		JSON.stringify({
			rules: await listRulesByRatePlan(ratePlanId),
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
