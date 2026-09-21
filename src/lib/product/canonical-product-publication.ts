import type { ProductReadinessValidationError } from "@/modules/catalog/public"
import {
	loadCompleteToPublishState,
	type CompleteToPublishState,
} from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { auditTourProductPolicyCompatibility } from "@/lib/policies/audit-tour-policy-compatibility"

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
	const errors = publicationValidationErrorsFromState(state)
	const incompatible = await auditTourProductPolicyCompatibility(params.productId)
	if (incompatible.length) {
		errors.push({
			code: "tour_policy_compatibility_review_required",
			message: `Hay ${incompatible.length} condición${incompatible.length === 1 ? "" : "es"} histórica${incompatible.length === 1 ? "" : "s"} incompatible${incompatible.length === 1 ? "" : "s"}. Reemplázala desde la tarifa antes de publicar; no se convertirá automáticamente.`,
		})
	}
	return errors
}
