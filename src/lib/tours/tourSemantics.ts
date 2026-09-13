/**
 * Tour vertical semantic adapters.
 * Maps shared reservation line columns to tour domain language.
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
	bookingLineItemTable: "BookingLineItem",
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

/**
 * Human-scale duration buckets used by public tour discovery.
 *
 * A tour that lasts a normal working day must not be presented as a multi-day
 * activity. Legacy values are accepted below so saved search URLs continue to
 * work while the panel emits the clearer values.
 */
export const TOUR_DURATION_OPTIONS = [
	{ value: "up_to_4h", label: "Hasta 4 horas" },
	{ value: "four_to_eight_hours", label: "Más de 4 a menos de 8 horas" },
	{ value: "full_day", label: "Jornada completa (8–24 horas)" },
	{ value: "multi_day", label: "Más de un día" },
] as const

export type TourDurationBucket = (typeof TOUR_DURATION_OPTIONS)[number]["value"]

export function normalizeTourDurationBucket(
	bucket: string | null | undefined
): TourDurationBucket | null {
	const value = String(bucket ?? "").trim()
	if (!value) return null
	if (TOUR_DURATION_OPTIONS.some((option) => option.value === value)) {
		return value as TourDurationBucket
	}
	// URLs emitted before Fase 1.
	if (value === "lt1") return "up_to_4h"
	if (value === "1") return "full_day"
	if (["2-3", "4-7", "8+"].includes(value)) return "multi_day"
	return null
}

export function tourDurationBucketLabel(bucket: string | null | undefined): string | null {
	const normalized = normalizeTourDurationBucket(bucket)
	return TOUR_DURATION_OPTIONS.find((option) => option.value === normalized)?.label ?? null
}

/** Duration filter buckets used by TourSearchPanel and SearchUnitView. */
export function durationMinutesMatchesBucket(
	durationMinutes: number | null | undefined,
	bucket: string | null | undefined
): boolean {
	const b = normalizeTourDurationBucket(bucket)
	if (!b) return true
	if (durationMinutes == null || !Number.isFinite(durationMinutes)) return false
	const m = Number(durationMinutes)
	if (b === "up_to_4h") return m <= 4 * 60
	if (b === "four_to_eight_hours") return m > 4 * 60 && m < 8 * 60
	if (b === "full_day") return m >= 8 * 60 && m < 24 * 60
	if (b === "multi_day") return m >= 24 * 60
	return true
}
