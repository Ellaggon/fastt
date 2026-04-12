import type { APIRoute } from "astro"
import { ratePlanCommandRepository, variantManagementRepository } from "@/container"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { createRatePlan } from "@/modules/pricing/public"

export const POST: APIRoute = async ({ request }) => {
	const body = (await request.json()) as { variantId?: string }

	const result = await createRatePlan({ repo: ratePlanCommandRepository }, body)

	if (!result.ok) {
		return new Response(JSON.stringify({ error: result.error }), { status: result.status })
	}
	if (body.variantId) {
		invalidateAggregateCache({ variantId: body.variantId })
		const variant = await variantManagementRepository.getVariantById(body.variantId)
		if (variant) {
			await invalidateVariant(body.variantId, variant.productId)
		}
	}

	return new Response(JSON.stringify({ ratePlanId: result.ratePlanId }), { status: 201 })
}
