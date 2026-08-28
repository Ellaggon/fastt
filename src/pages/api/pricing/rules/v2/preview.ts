import type { APIRoute } from "astro"
import { pricingRuleCommandService } from "@/container"
import {
	normalizedPricingRuleCommandFromPayload,
	readRequestPayload,
	requireText,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"
import { PricingRuleCommandError } from "@/modules/pricing/public"

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const payload = await readRequestPayload(request)
		const ratePlanId = requireText(payload, "ratePlanId")
		if (!ratePlanId) return json(400, { error: "ratePlanId_required" })
		const ownership = await resolveOwnedRatePlanContext(request, ratePlanId)
		if (!ownership.ok) return ownership.response
		const providerId = String(ownership.ownerContext.providerId ?? "").trim()
		if (!providerId) return json(403, { error: "provider_not_found" })
		return json(
			200,
			await pricingRuleCommandService.previewCandidate(
				{ ...ownership.ownerContext, providerId },
				normalizedPricingRuleCommandFromPayload(payload)
			)
		)
	} catch (error) {
		if (error instanceof PricingRuleCommandError) return json(error.status, { error: error.code })
		throw error
	}
}
