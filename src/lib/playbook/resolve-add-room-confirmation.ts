import { routes } from "@/lib/routes"
import {
	buildAddRoomHref,
	getAddRoomStepById,
	type AddRoomContext,
	type AddRoomStepId,
} from "@/lib/playbook/add-room"
import { loadVariantCompletion } from "@/lib/playbook/evaluate-add-room-progress"
import { getProductVariantsAggregate } from "@/modules/catalog/public"

export type AddRoomConfirmationResolution =
	| { kind: "redirect"; location: string }
	| { kind: "ready"; roomName: string }

export async function resolveAddRoomConfirmationPage(input: {
	productId: string
	providerId: string
	variantId: string
	playbook: { ratePlanId: string }
}): Promise<AddRoomConfirmationResolution> {
	const { productId, providerId, variantId, playbook } = input
	const requestedPlanId = String(playbook.ratePlanId ?? "").trim() || undefined
	const completion = await loadVariantCompletion(productId, providerId, variantId, requestedPlanId)
	if (!completion) {
		return {
			kind: "redirect",
			location: buildAddRoomHref(routes.productRoomNew(productId), "create-room"),
		}
	}

	const context: AddRoomContext = {
		productId,
		variantId,
		ratePlanId: requestedPlanId ?? completion.selectedRatePlanId ?? undefined,
	}
	const redirectToStep = (stepId: AddRoomStepId) => {
		const step = getAddRoomStepById(stepId, context)
		return step?.buildHref(context) ?? routes.productRoomsForProduct(productId)
	}

	if (!completion.inventoryConfigComplete || !completion.profileComplete) {
		return { kind: "redirect", location: redirectToStep("create-room") }
	}
	if (!completion.photosComplete) {
		return { kind: "redirect", location: redirectToStep("room-photos") }
	}
	if (!completion.rateConfigured || !completion.pricingComplete) {
		return { kind: "redirect", location: redirectToStep("create-rate") }
	}
	if (!completion.conditionsComplete) {
		return { kind: "redirect", location: redirectToStep("conditions") }
	}
	if (!completion.availabilityComplete) {
		return { kind: "redirect", location: redirectToStep("availability") }
	}
	if (!completion.sellable) {
		const calendarHref = redirectToStep("availability")
		const url = new URL(calendarHref, "http://localhost")
		url.searchParams.set("finalizeError", "activation-pending")
		return { kind: "redirect", location: `${url.pathname}${url.search}${url.hash}` }
	}

	const aggregate = await getProductVariantsAggregate(productId, providerId)
	const roomName =
		aggregate?.variants.find((variant) => String(variant.id) === variantId)?.name ?? "Habitación"

	return { kind: "ready", roomName }
}
