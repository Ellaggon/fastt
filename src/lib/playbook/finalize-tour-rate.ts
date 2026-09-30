import { tourActivationBlockers } from "./tourActivationBlockers"
import {
	ratePlanCommandRepository,
	ratePlanPricingReadRepository,
	variantManagementRepository,
} from "@/container"
import {
	invalidateCalendarSurface,
	invalidatePricing,
	invalidateProvider,
	invalidateVariant,
} from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { buildCompleteToPublishHref } from "@/lib/playbook/complete-to-publish"
import { buildTourPlaybookHref, buildTourReviewHref } from "@/lib/playbook/launch-tour"
import { assertProviderCapability } from "@/lib/provider-governance"
import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"
import { evaluateVariantReadiness } from "@/modules/catalog/public"
import { getRatePlanById, resolveRatePlanOwnerContext } from "@/modules/pricing/public"

type Input = {
	providerId: string
	userId: string
	productId: string
	variantId: string
	ratePlanId: string
	playbook: "launch-tour" | "complete-to-publish"
}

async function refreshTourActivationSurfaces(input: Input): Promise<boolean> {
	try {
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
		return true
	} catch (error) {
		// The database transaction has already committed; cache failure must not
		// tell the provider that activation failed. A retry will refresh again.
		console.error("tour activation cache invalidation failed", error)
		return false
	}
}

function successResult(input: Input, alreadyActive: boolean, cacheRefreshPending: boolean) {
	const previewPath = buildTourReviewHref(input.productId, input)
	return {
		ok: true as const,
		ratePlanId: input.ratePlanId,
		alreadyActive,
		cacheRefreshPending,
		terminalHref:
			input.playbook === "complete-to-publish"
				? buildCompleteToPublishHref(previewPath, "preview")
				: buildTourPlaybookHref(previewPath, "preview"),
	}
}

export async function finalizeTourRate(input: Input) {
	const owner = await resolveRatePlanOwnerContext(input.ratePlanId)
	if (
		!owner ||
		owner.providerId !== input.providerId ||
		owner.productId !== input.productId ||
		owner.variantId !== input.variantId ||
		String(owner.productType ?? "")
			.trim()
			.toLowerCase() !== "tour"
	) {
		return { ok: false as const, status: 404 as const, error: "Tarifa o salida no encontrada." }
	}

	await assertProviderCapability({
		providerId: input.providerId,
		currentUserId: input.userId,
		capability: "publish",
	})

	const [ratePlan, variant] = await Promise.all([
		getRatePlanById(input.ratePlanId) as Promise<{
			name?: unknown
			description?: unknown
			isActive?: unknown
			isDefault?: unknown
		} | null>,
		variantManagementRepository.getVariantById(input.variantId),
	])
	if (!ratePlan) {
		return { ok: false as const, status: 404 as const, error: "Tarifa no encontrada." }
	}
	if (
		!variant ||
		variant.productId !== input.productId ||
		String(variant.kind ?? "")
			.trim()
			.toLowerCase() !== "tour_slot"
	) {
		return { ok: false as const, status: 404 as const, error: "Salida no encontrada." }
	}

	// A retry after a lost response reports the state that already committed,
	// without requiring the original validation snapshot to remain unchanged.
	if (ratePlan.isActive && ratePlan.isDefault && variant.salesEnabled) {
		const cacheRefreshed = await refreshTourActivationSurfaces(input)
		return successResult(input, true, !cacheRefreshed)
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
			blockers: tourActivationBlockers(
				publication.blockerDetails ??
					publication.blockers.map((label) => ({ id: "departure", label })),
				input
			),
		}
	}
	const readiness = await evaluateVariantReadiness(
		{ repo: variantManagementRepository, pricingReadRepo: ratePlanPricingReadRepository },
		{ variantId: input.variantId, ratePlanId: input.ratePlanId }
	)
	if (readiness.lifecycleState !== "ready") {
		return {
			ok: false as const,
			status: 409 as const,
			error: "La salida aún no está lista para activar.",
			blockers: tourActivationBlockers(
				readiness.validationErrors
					.filter((error) => error.code !== "inventory_missing")
					.map((error) => ({ id: error.code, label: error.message })),
				input
			),
		}
	}

	const activationResult = await ratePlanCommandRepository.activateTourRate({
		ratePlanId: input.ratePlanId,
		variantId: input.variantId,
		productId: input.productId,
		providerId: input.providerId,
		name: String(ratePlan.name ?? "Tarifa"),
		description: ratePlan.description == null ? null : String(ratePlan.description),
	})
	if (activationResult === "not_found") {
		return { ok: false as const, status: 404 as const, error: "Tarifa o salida no encontrada." }
	}
	if (activationResult === "not_ready") {
		const [currentPublication, currentReadiness] = await Promise.all([
			validateRatePlanPublication({
				productId: input.productId,
				variantId: input.variantId,
				ratePlanId: input.ratePlanId,
			}),
			evaluateVariantReadiness(
				{ repo: variantManagementRepository, pricingReadRepo: ratePlanPricingReadRepository },
				{ variantId: input.variantId, ratePlanId: input.ratePlanId }
			),
		])
		const blockers = [
			...(currentPublication.blockerDetails ??
				currentPublication.blockers.map((label) => ({ id: "departure", label }))),
			...(currentReadiness.lifecycleState !== "ready"
				? currentReadiness.validationErrors
						.filter((error) => error.code !== "inventory_missing")
						.map((error) => ({
							id: error.code,
							label: error.message,
						}))
				: []),
		]
		return {
			ok: false as const,
			status: 409 as const,
			error: "La salida cambió mientras se activaba. Revisa estos requisitos y vuelve a intentar.",
			blockers: tourActivationBlockers(
				blockers.length
					? blockers
					: [{ id: "departure", label: "Actualiza la salida y vuelve a intentar la activación." }],
				input
			),
		}
	}
	const cacheRefreshed = await refreshTourActivationSurfaces(input)
	return successResult(input, activationResult === "already_active", !cacheRefreshed)
}
