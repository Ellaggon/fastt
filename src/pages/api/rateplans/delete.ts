import type { APIRoute } from "astro"
import { db, eq, RatePlan } from "astro:db"
import { ratePlanCommandRepository, variantManagementRepository } from "@/container"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { clearAggregateCache } from "@/lib/cache/ssrAggregateCache"

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		let id = url.searchParams.get("id")

		if (!id) {
			const body = await request.json().catch(() => null)
			id = body?.id
		}

		if (!id) {
			return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
		}
		const ratePlan = await db
			.select({ variantId: RatePlan.variantId })
			.from(RatePlan)
			.where(eq(RatePlan.id, id))
			.get()
		const result = await ratePlanCommandRepository.deleteRatePlan(id)
		if (result === "ok") {
			clearAggregateCache()
			if (ratePlan?.variantId) {
				const variant = await variantManagementRepository.getVariantById(ratePlan.variantId)
				if (variant) {
					await invalidateVariant(ratePlan.variantId, variant.productId)
				}
			}
			return new Response(JSON.stringify({ success: true }), { status: 200 })
		}
		return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
	} catch (e) {
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
