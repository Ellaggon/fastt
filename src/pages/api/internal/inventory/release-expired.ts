import type { APIRoute } from "astro"

import { inventoryHoldRepository, variantManagementRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { releaseExpiredHolds } from "@/modules/inventory/public"

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await releaseExpiredHolds({ repo: inventoryHoldRepository }, { now: new Date() })

		await Promise.all(
			result.releasedVariantIds.map(async (variantId) => {
				const variant = await variantManagementRepository.getVariantById(variantId)
				if (variant) {
					await invalidateVariant(variantId, variant.productId)
				}
			})
		)

		return new Response(JSON.stringify({ ok: true, ...result }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
