export function buildOccupancyKey(params: {
	rooms?: number
	adults?: number
	children?: number
	totalGuests?: number
}): string {
	const rooms = Math.max(1, Number(params.rooms ?? 1) || 1)
	const adults = Math.max(0, Number(params.adults ?? 0) || 0)
	const children = Math.max(0, Number(params.children ?? 0) || 0)
	const fallbackGuests = adults + children
	const totalGuests = Math.max(1, Number(params.totalGuests ?? (fallbackGuests || 1)))
	return `r${rooms}_a${adults}_c${children}_g${totalGuests}`
}
