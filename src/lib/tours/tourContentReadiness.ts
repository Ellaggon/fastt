import type { ProductFullAggregate } from "@/modules/catalog/public"
import { TOUR_QUALITY_MIN_IMAGES, TOUR_QUALITY_MIN_ITINERARY_STEPS } from "./tourAdminQuality"

/** Content readiness is shared by publication and the five-stage creation close. */
export function evaluateTourContentReadiness(
	aggregate: ProductFullAggregate,
	readiness: { hasCategory?: boolean; hasActiveTickets?: boolean } | null | undefined
) {
	const tour = aggregate.subtype?.kind === "tour" ? aggregate.subtype : null
	const presentation = Boolean(
		aggregate.displayName?.trim() &&
		aggregate.geoPlace?.id &&
		String(aggregate.content.description ?? "").trim() &&
		Array.isArray(aggregate.content.highlights) &&
		aggregate.content.highlights.length
	)
	const logistics = Boolean(
		tour &&
		Number(tour.durationMinutes ?? 0) > 0 &&
		tour.meetingPoint &&
		Array.isArray(tour.includes) &&
		tour.includes.length &&
		Array.isArray(tour.itinerary) &&
		tour.itinerary.filter(Boolean).length >= TOUR_QUALITY_MIN_ITINERARY_STEPS
	)
	const location = aggregate.location.lat !== null && aggregate.location.lng !== null
	const photos = aggregate.images.length >= TOUR_QUALITY_MIN_IMAGES
	const participants = Boolean(readiness?.hasActiveTickets)
	const activities = Boolean(readiness?.hasCategory)
	return {
		presentation,
		logistics,
		location,
		photos,
		participants,
		activities,
		complete: presentation && activities && logistics && location && photos && participants,
	}
}
