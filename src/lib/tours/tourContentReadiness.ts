import { evaluateExperienceClassification } from "@/shared/domain/experience-classification"
import { evaluateExperienceProgram } from "@/shared/domain/experience-program"
import { experienceFormatReady } from "@/shared/domain/experience-format"
import type { ProductFullAggregate } from "@/modules/catalog/public"
import { TOUR_QUALITY_MIN_IMAGES } from "./tourAdminQuality"

/** Content readiness is shared by publication and the five-stage creation close. */
export function evaluateTourContentReadiness(
	aggregate: ProductFullAggregate,
	readiness: { hasCategory?: boolean; hasActiveTickets?: boolean } | null | undefined
) {
	const tour = aggregate.subtype?.kind === "tour" ? aggregate.subtype : null
	const presentation = Boolean(
		experienceFormatReady(tour ?? { formatContractVersion: 1 }) &&
		aggregate.displayName?.trim() &&
		aggregate.geoPlace?.id &&
		String(aggregate.content.description ?? "").trim() &&
		Array.isArray(aggregate.content.highlights) &&
		aggregate.content.highlights.length
	)
	const program = evaluateExperienceProgram({
		experienceFormat: tour?.experienceFormat,
		durationMinutes: tour?.durationMinutes,
		meetingPoint: tour?.meetingPoint,
		itinerary: tour?.itinerary,
		includes: tour?.includes,
	})
	const logistics = Boolean(tour && program.programComplete)
	const location =
		aggregate.location.lat !== null &&
		aggregate.location.lng !== null &&
		program.checks.meetingPoint
	const photos = aggregate.images.length >= TOUR_QUALITY_MIN_IMAGES
	const participants = Boolean(readiness?.hasActiveTickets)
	const classification = evaluateExperienceClassification({
		...tour,
		hasLegacyCategory: readiness?.hasCategory,
	})
	const activities = classification.ready
	return {
		presentation,
		logistics,
		program,
		location,
		photos,
		participants,
		activities,
		classification,
		complete: presentation && activities && logistics && location && photos && participants,
	}
}
