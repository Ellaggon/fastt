import { ratePlanCommandRepository } from "@/container"
import {
	invalidateCalendarSurface,
	invalidatePricing,
	invalidateProvider,
	invalidateVariant,
} from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { buildCompleteToPublishHref } from "@/lib/playbook/complete-to-publish"
import { buildTourPlaybookHref } from "@/lib/playbook/launch-tour"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import { routes } from "@/lib/routes"
import { getRatePlanById, resolveRatePlanOwnerContext } from "@/modules/pricing/public"

type Input = {
	providerId: string
	userId: string
	productId: string
	variantId: string
	ratePlanId: string
	playbook: "launch-tour" | "complete-to-publish"
}

export async function finalizeTourRate(input: Input) {
	const owner = await resolveRatePlanOwnerContext(input.ratePlanId)
	if (
		!owner ||
		owner.providerId !== input.providerId ||
		owner.productId !== input.productId ||
		owner.variantId !== input.variantId
	) {
		return { ok: false as const, status: 404 as const, error: "Tarifa o salida no encontrada." }
	}

	const ratePlan = (await getRatePlanById(input.ratePlanId)) as {
		name?: unknown
		description?: unknown
		isActive?: unknown
	} | null
	if (!ratePlan) {
		return { ok: false as const, status: 404 as const, error: "Tarifa no encontrada." }
	}

	const publication = await validateRatePlanPublication({
		productId: input.productId,
		variantId: input.variantId,
		ratePlanId: input.ratePlanId,
	})
	if (!publication.canPublish) {
		return {
			ok: false as const,
			status: 409 as const,
			error: "Aún falta información para activar la tarifa de esta salida.",
			blockers: publication.blockers,
		}
	}

	await ratePlanCommandRepository.updateRatePlan({
		ratePlanId: input.ratePlanId,
		isActive: true,
		isDefault: true,
		name: String(ratePlan.name ?? "Tarifa"),
		description: ratePlan.description == null ? null : String(ratePlan.description),
	})

	invalidateAggregateCache({
		providerId: input.providerId,
		productId: input.productId,
		variantId: input.variantId,
	})
	await Promise.all([
		invalidateVariant(input.variantId, input.productId),
		invalidatePricing({
			ratePlanId: input.ratePlanId,
			variantId: input.variantId,
			productId: input.productId,
			providerId: input.providerId,
		}),
		invalidateCalendarSurface(input.providerId, "playbook_tour_rate_finalize"),
		invalidateProvider(input.providerId),
	])

	const previewPath = routes.productPreview(input.productId)
	return {
		ok: true as const,
		ratePlanId: input.ratePlanId,
		terminalHref:
			input.playbook === "complete-to-publish"
				? buildCompleteToPublishHref(previewPath, "preview")
				: buildTourPlaybookHref(previewPath, "preview"),
	}
}
