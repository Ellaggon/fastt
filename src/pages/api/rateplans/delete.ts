import type { APIRoute } from "astro"
import { ratePlanCommandRepository } from "@/container"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { clearAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { requireProvider } from "@/lib/auth/requireProvider"

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		const { providerId } = await requireProvider(request)
		let id = url.searchParams.get("id")

		if (!id) {
			const body = await request.json().catch(() => null)
			id = body?.id
		}

		if (!id) {
			return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
		}
		const ownerContext = await resolveRatePlanOwnerContext(id)
		if (!ownerContext || ownerContext.providerId !== providerId) {
			return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
		}
		const result = await ratePlanCommandRepository.deleteRatePlan(id)
		if (result === "ok") {
			clearAggregateCache()
			if (ownerContext) {
				await invalidateVariant(ownerContext.variantId, ownerContext.productId)
			}
			return new Response(JSON.stringify({ success: true }), { status: 200 })
		}
		return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
	} catch (e) {
		if (e instanceof Response) return e
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
