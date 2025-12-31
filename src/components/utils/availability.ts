import type { AvailabilityResponse, RatePlan } from "@/components/booking/availabilityTypes"

export function findAvailability(
	results: AvailabilityResponse | null,
	roomId: string
): RatePlan | null {
	if (!results) return null

	for (const product of results.results) {
		for (const variant of product.variants) {
			if (variant.id === roomId) {
				return variant.ratePlans?.[0] ?? null
			}
		}
	}
	return null
}
