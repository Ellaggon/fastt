import {
	buildOccupancyKey as buildCanonicalOccupancyKey,
	normalizeOccupancy,
	type NormalizeOccupancyInput,
} from "@/shared/domain/occupancy"

export function buildOccupancyKey(input: NormalizeOccupancyInput): string {
	return buildCanonicalOccupancyKey(normalizeOccupancy(input))
}
