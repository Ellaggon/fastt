export type Occupancy = {
	adults: number
	children: number
	infants: number
}

export type NormalizeOccupancyInput = {
	adults?: number | string | null
	children?: number | string | null
	infants?: number | string | null
}

function toNonNegativeInteger(value: unknown): number {
	const candidate = Number(value)
	if (!Number.isFinite(candidate)) return 0
	return Math.max(0, Math.floor(candidate))
}

export function normalizeOccupancy(input: NormalizeOccupancyInput): Occupancy {
	const adultsCandidate = toNonNegativeInteger(input.adults)
	const children = toNonNegativeInteger(input.children)
	const infants = toNonNegativeInteger(input.infants)
	const adults = Math.max(1, adultsCandidate)
	return { adults, children, infants }
}

export function buildOccupancyKey(input: NormalizeOccupancyInput): string {
	const normalized = normalizeOccupancy(input)
	return `a${normalized.adults}_c${normalized.children}_i${normalized.infants}`
}
