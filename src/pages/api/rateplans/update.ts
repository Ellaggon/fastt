import type { APIRoute } from "astro"
import { z, ZodError } from "zod"
import { ratePlanCommandRepository } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { getRatePlanById, resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import { getRatePlanRemovalReadiness } from "@/lib/rates/getRatePlanRemovalReadiness"

const updateRatePlanSchema = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(2).max(120),
	description: z.string().trim().max(500).nullable().optional(),
	isActive: z.boolean(),
	isDefault: z.boolean().optional(),
})

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const PUT: APIRoute = async ({ request }) => {
	try {
		const { providerId } = await requireProvider(request)
		const body = updateRatePlanSchema.parse(await request.json())
		const owner = await resolveRatePlanOwnerContext(body.id)
		if (!owner || owner.providerId !== providerId)
			return json(404, { error: "Tarifa no encontrada." })
		const current = (await getRatePlanById(body.id)) as {
			isActive?: boolean
			isDefault?: boolean
		} | null
		if (body.isActive && !current?.isActive) {
			const publication = await validateRatePlanPublication({
				ratePlanId: body.id,
				variantId: owner.variantId,
				productId: owner.productId,
			})
			if (!publication.canPublish) {
				return json(409, {
					error: `No puede publicarse. Falta: ${publication.blockers.join(", ")}.`,
				})
			}
		}
		if (!body.isActive && current?.isActive && current.isDefault && body.isDefault !== false) {
			const readiness = await getRatePlanRemovalReadiness({
				ratePlanId: body.id,
				variantId: owner.variantId,
				isActive: true,
				isDefault: true,
			})
			if (readiness.activeAlternatives > 0) {
				return json(409, {
					error: "Designa otra tarifa principal antes de desactivar esta.",
				})
			}
		}

		const result = await ratePlanCommandRepository.updateRatePlan({
			ratePlanId: body.id,
			isActive: body.isActive,
			isDefault: body.isDefault,
			name: body.name,
			description: body.description ?? null,
		})
		if (result === "not_found") return json(404, { error: "Tarifa no encontrada." })

		invalidateAggregateCache({ variantId: owner.variantId })
		await invalidateVariant(owner.variantId, owner.productId)
		return json(200, { success: true })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof ZodError) return json(400, { error: "Revisa los datos de la tarifa." })
		console.error("rateplans:update", error)
		return json(500, { error: "No se pudo actualizar la tarifa." })
	}
}
