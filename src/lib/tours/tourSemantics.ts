/**
 * Tour vertical semantic adapters.
 * Maps lodging-shaped persistence columns to tour domain language without renaming DB.
 */

export type TourBookingDates = {
	departureDate: string
	endDate: string
}

export type TourSearchStay = {
	checkIn: Date
	checkOut: Date
	nights: number
}

/**
 * Domain shape for a booking line item.
 * Persistence table remains `BookingRoomDetail`; drizzle export alias is `BookingLineItem`.
 */
export type BookingLineItem = {
	id: string
	bookingId: string
	variantId: string
	ratePlanId: string
	checkIn: string | Date
	checkOut: string | Date
	adults: number
	children: number
	subtotalAmount: number
	taxAmount: number
	totalAmount: number
}

export const TOUR_SEMANTICS = {
	variantKind: "tour_slot",
	/** Physical table name — never renamed (Fase 6 soft alias). */
	bookingLineItemTable: "BookingRoomDetail",
	bookingLineItemAlias: "BookingLineItem",
	pricePerUnitColumn: "pricePerNight",
	departureDateColumn: "checkInDate",
	endDateColumn: "checkOutDate",
	daysBeforeDepartureColumn: "daysBeforeArrival",
} as const

function toISODateOnly(d: Date): string {
	return d.toISOString().slice(0, 10)
}

function parseISODateOnly(value: string): Date {
	const d = new Date(`${value}T00:00:00.000Z`)
	if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${value}`)
	return d
}

/** Day-tour stay: checkIn = departure, checkOut = next calendar day (1 night grid). */
export function tourDepartureToStay(departureDate: string): TourSearchStay {
	const checkIn = parseISODateOnly(departureDate)
	const checkOut = new Date(checkIn)
	checkOut.setUTCDate(checkOut.getUTCDate() + 1)
	return { checkIn, checkOut, nights: 1 }
}

export function bookingDatesToTourDeparture(input: {
	checkInDate: string | Date
	checkOutDate: string | Date
}): TourBookingDates {
	const departureDate =
		typeof input.checkInDate === "string"
			? input.checkInDate.slice(0, 10)
			: toISODateOnly(input.checkInDate)
	const endDate =
		typeof input.checkOutDate === "string"
			? input.checkOutDate.slice(0, 10)
			: toISODateOnly(input.checkOutDate)
	return { departureDate, endDate }
}

export function pricePerNightAsUnitPrice(pricePerNight: number | null | undefined): number | null {
	if (pricePerNight == null || !Number.isFinite(Number(pricePerNight))) return null
	return Number(pricePerNight)
}

export function daysBeforeArrivalAsDaysBeforeDeparture(
	days: number | null | undefined
): number | null {
	if (days == null || !Number.isFinite(Number(days))) return null
	return Number(days)
}

/** Prefer hours-based cancel cutoff when present (Fase 4). */
export function resolveCancelLeadHours(tier: {
	daysBeforeArrival?: number | null
	hoursBeforeDeparture?: number | null
}): number {
	if (tier.hoursBeforeDeparture != null && Number.isFinite(Number(tier.hoursBeforeDeparture))) {
		return Math.max(0, Number(tier.hoursBeforeDeparture))
	}
	return Math.max(0, Number(tier.daysBeforeArrival ?? 0)) * 24
}

/** Heuristic: parse free-text Tour.duration into minutes when possible. */
export function parseDurationMinutes(duration: string | null | undefined): number | null {
	const raw = String(duration ?? "")
		.trim()
		.toLowerCase()
	if (!raw) return null

	const hourMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas)/)
	if (hourMatch) {
		return Math.round(Number(hourMatch[1].replace(",", ".")) * 60)
	}
	const dayMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(d|día|dias|días|day|days)/)
	if (dayMatch) {
		return Math.round(Number(dayMatch[1].replace(",", ".")) * 24 * 60)
	}
	const minMatch = raw.match(/(\d+)\s*(m|min|mins|minuto|minutos)/)
	if (minMatch) return Number(minMatch[1])
	return null
}

export function isTourSlotKind(kind: string | null | undefined): boolean {
	return (
		String(kind ?? "")
			.trim()
			.toLowerCase() === TOUR_SEMANTICS.variantKind
	)
}

/** Duration filter buckets used by TourSearchPanel. */
export function durationMinutesMatchesBucket(
	durationMinutes: number | null | undefined,
	bucket: string | null | undefined
): boolean {
	const b = String(bucket ?? "").trim()
	if (!b) return true
	if (durationMinutes == null || !Number.isFinite(durationMinutes)) return false
	const m = Number(durationMinutes)
	if (b === "lt1") return m < 24 * 60
	if (b === "1") return m >= 24 * 60 && m < 48 * 60
	if (b === "2-3") return m >= 48 * 60 && m < 96 * 60
	if (b === "4-7") return m >= 96 * 60 && m < 192 * 60
	if (b === "8+") return m >= 192 * 60
	return true
}
