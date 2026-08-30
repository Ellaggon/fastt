import type { ProductReadinessValidationError } from "@/modules/catalog/public"
import {
	loadCompleteToPublishState,
	type CompleteToPublishState,
} from "@/lib/playbook/evaluate-complete-to-publish-progress"

const validationCodeBySection = {
	content: "missing_content",
	photos: "missing_images",
	location: "missing_location",
	subtype: "missing_subtype",
	rooms: "missing_sellable_room",
	houseRules: "missing_essential_house_rules",
	bookingPolicies: "missing_booking_policies",
	itinerary: "missing_itinerary",
	tickets: "missing_tickets",
	departure: "missing_departure",
	rate: "missing_rate",
	calendar: "missing_availability",
	inclusions: "missing_inclusions",
} as const

export function publicationValidationErrorsFromState(
	state: CompleteToPublishState
): ProductReadinessValidationError[] {
	return state.blockers
		.filter((check) => check.sectionKey !== "preview")
		.map((check) => ({
			code:
				validationCodeBySection[check.sectionKey as keyof typeof validationCodeBySection] ??
				`missing_${check.sectionKey}`,
			message: check.detail,
		}))
}

export async function resolveCanonicalProductPublicationValidationErrors(params: {
	productId: string
	providerId: string
	request?: Request
	url?: URL
}): Promise<ProductReadinessValidationError[]> {
	const state = await loadCompleteToPublishState(params)
	if (!state) return [{ code: "missing_product", message: "No se encontró el producto." }]
	return publicationValidationErrorsFromState(state)
}
