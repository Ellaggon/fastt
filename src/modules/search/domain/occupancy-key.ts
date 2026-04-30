import {
	buildOccupancyKey as buildCanonicalOccupancyKey,
	type Occupancy,
} from "@/shared/domain/occupancy"

type BuildOccupancyKeyInput = {
	adults?: number
	children?: number
	infants?: number
	// Backward-compatible fields accepted for callers not migrated yet.
	rooms?: number
	totalGuests?: number
}

function toCanonicalOccupancy(input: BuildOccupancyKeyInput): Occupancy {
	const adultsCandidate = Number(input.adults ?? 0)
	const childrenCandidate = Number(input.children ?? 0)

	// Keep compatibility with legacy callers that only provided totalGuests.
	// We still normalize to canonical occupancy where adults is the source of truth.
	const fallbackAdults =
		Number.isFinite(adultsCandidate) && adultsCandidate > 0
			? adultsCandidate
			: Number(input.totalGuests ?? 1)

	return {
		adults: fallbackAdults,
		children: Number.isFinite(childrenCandidate) ? childrenCandidate : 0,
		infants: Number(input.infants ?? 0),
	}
}

export function buildOccupancyKey(input: BuildOccupancyKeyInput): string {
	return buildCanonicalOccupancyKey(toCanonicalOccupancy(input))
}
