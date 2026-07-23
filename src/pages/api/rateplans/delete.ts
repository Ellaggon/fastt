import type { APIRoute } from "astro"
import { ratePlanCommandRepository } from "@/container"
import { invalidatePricing, invalidateProvider, invalidateVariant } from "@/lib/cache/invalidation"
import { clearAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { getRatePlanRemovalReadiness } from "@/lib/rates/getRatePlanRemovalReadiness"
import { getRatePlanById, resolveRatePlanOwnerContext } from "@/modules/pricing/public"
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
			return new Response(JSON.stringify({ error: "Tarifa no encontrada." }), { status: 404 })
		}
		const ratePlan = (await getRatePlanById(id)) as {
			isActive?: boolean
			isDefault?: boolean
		} | null
		if (!ratePlan) {
			return new Response(JSON.stringify({ error: "Tarifa no encontrada." }), { status: 404 })
		}
		const readiness = await getRatePlanRemovalReadiness({
			ratePlanId: id,
			variantId: ownerContext.variantId,
			isActive: Boolean(ratePlan.isActive),
			isDefault: Boolean(ratePlan.isDefault),
		})
		if (!readiness.canDelete) {
			return new Response(
				JSON.stringify({
					error: readiness.blockers[0] ?? "La tarifa no puede eliminarse.",
					blockers: readiness.blockers,
				}),
				{ status: 409, headers: { "Content-Type": "application/json" } }
			)
		}
		const result = await ratePlanCommandRepository.deleteRatePlan(id)
		if (result === "ok") {
			clearAggregateCache()
			if (ownerContext) {
				await invalidateVariant(ownerContext.variantId, ownerContext.productId)
				await invalidatePricing({
					ratePlanId: id,
					variantId: ownerContext.variantId,
					productId: ownerContext.productId,
					providerId,
				})
				await invalidateProvider(providerId)
			}
			return new Response(JSON.stringify({ success: true }), { status: 200 })
		}
		return new Response(JSON.stringify({ error: "Tarifa no encontrada." }), { status: 404 })
	} catch (e) {
		if (e instanceof Response) return e
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "No se pudo eliminar la tarifa." }), {
			status: 500,
		})
	}
}
