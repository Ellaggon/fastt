import { ratePlanCommandRepository } from "@/container"
import {
	invalidateCalendarSurface,
	invalidatePricing,
	invalidateProvider,
	invalidateVariant,
} from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { getAddRoomStepById, type AddRoomContext } from "@/lib/playbook/add-room"
import { loadVariantCompletion } from "@/lib/playbook/evaluate-add-room-progress"
import { assertProviderCapability } from "@/lib/provider-governance"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import { getRatePlanById, resolveRatePlanOwnerContext } from "@/modules/pricing/public"

export type FinalizeAddRoomInput = {
	providerId: string
	userId: string
	productId: string
	variantId: string
	ratePlanId: string
}

export type FinalizeAddRoomResult =
	| { ok: true; ratePlanId: string; terminalHref: string }
	| { ok: false; status: 404 | 409; error: string; blockers?: string[] }

function terminalHref(ctx: AddRoomContext): string {
	return (
		getAddRoomStepById("confirmation", ctx)?.buildHref(ctx) ?? `/product/${ctx.productId}/rooms`
	)
}

/**
 * Performs the only mutation that turns a configured add-room draft into a
 * sellable room. Repeating a successful request is safe: it only reasserts
 * the selected rate as active and principal.
 */
export async function finalizeAddRoom(input: FinalizeAddRoomInput): Promise<FinalizeAddRoomResult> {
	const owner = await resolveRatePlanOwnerContext(input.ratePlanId)
	if (
		!owner ||
		owner.providerId !== input.providerId ||
		owner.productId !== input.productId ||
		owner.variantId !== input.variantId
	) {
		return { ok: false, status: 404, error: "Tarifa, habitación o alojamiento no encontrado." }
	}

	const ratePlan = (await getRatePlanById(input.ratePlanId)) as {
		name?: unknown
		description?: unknown
		isActive?: unknown
	} | null
	if (!ratePlan) return { ok: false, status: 404, error: "Tarifa no encontrada." }

	const completion = await loadVariantCompletion(
		input.productId,
		input.providerId,
		input.variantId,
		input.ratePlanId
	)
	if (!completion) {
		return { ok: false, status: 404, error: "Habitación no encontrada." }
	}

	const blockers: string[] = []
	if (!completion.inventoryConfigComplete) {
		blockers.push("Define cuántas unidades físicas existen para esta habitación.")
	}
	if (!completion.profileComplete && completion.inventoryConfigComplete) {
		blockers.push("Completa la capacidad, el perfil físico y al menos una cama.")
	}
	if (!completion.photosComplete) blockers.push("Agrega al menos una foto de la habitación.")
	if (!completion.pricingComplete) blockers.push("Define un precio base válido.")
	if (!completion.conditionsComplete) blockers.push("Completa las condiciones obligatorias.")
	if (!completion.availabilityComplete)
		blockers.push("Configura inventario inicial para al menos 30 noches.")

	const publication = await validateRatePlanPublication({
		ratePlanId: input.ratePlanId,
		variantId: input.variantId,
		productId: input.productId,
	})
	if (!publication.canPublish) {
		for (const blocker of publication.blockers) {
			if (blocker === "cupo físico" || blocker === "precio base") continue
			if (blocker === "condiciones obligatorias" && completion.conditionsComplete) continue
			if (blocker === "30 noches con disponibilidad" && completion.availabilityComplete) continue
			blockers.push(blocker)
		}
	}

	const uniqueBlockers = [...new Set(blockers)]
	if (uniqueBlockers.length) {
		return {
			ok: false,
			status: 409,
			error: "Aún falta información para finalizar la habitación.",
			blockers: uniqueBlockers,
		}
	}

	if (!ratePlan.isActive) {
		await assertProviderCapability({
			providerId: input.providerId,
			currentUserId: input.userId,
			capability: "publish",
		})
	}

	await ratePlanCommandRepository.updateRatePlan({
		ratePlanId: input.ratePlanId,
		isActive: true,
		isDefault: true,
		name: String(ratePlan.name ?? "Tarifa"),
		description: ratePlan.description == null ? null : String(ratePlan.description),
	})

	invalidateAggregateCache({ variantId: input.variantId })
	await Promise.all([
		invalidateVariant(input.variantId, input.productId),
		invalidatePricing({
			ratePlanId: input.ratePlanId,
			variantId: input.variantId,
			productId: input.productId,
			providerId: input.providerId,
		}),
		invalidateCalendarSurface(input.providerId, "playbook_add_room_finalize"),
		invalidateProvider(input.providerId),
	])

	return {
		ok: true,
		ratePlanId: input.ratePlanId,
		terminalHref: terminalHref({
			productId: input.productId,
			variantId: input.variantId,
			ratePlanId: input.ratePlanId,
		}),
	}
}
