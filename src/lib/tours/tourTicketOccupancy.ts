/**
 * Tour age-band → commercial occupancy mapping (MVP).
 *
 * Cupo: each ticket (adult/child/infant/custom) consumes 1 inventory unit.
 * Pricing: adult/child/infant map to occupancyDetail; custom inherits a bucket
 * (default adult, or age-based when minAge is set) until ticket-specific pricing exists.
 */

export type TourTicketCode = "adult" | "child" | "infant" | "custom"

export type TourTicketBand = {
	code: string
	label?: string | null
	minAge?: number | null
	maxAge?: number | null
	isActive?: boolean | null
	/** When code=custom, optional pricing bucket override. */
	pricingBucket?: "adult" | "child" | "infant" | null
}

export type TourTicketQuantities = Record<string, number>

export type TourOccupancyDetail = {
	adults: number
	children: number
	infants: number
}

/** Resolve which occupancy bucket a ticket row prices against. */
export function resolveTourTicketPricingBucket(
	ticket: TourTicketBand
): "adult" | "child" | "infant" {
	const code = String(ticket.code ?? "")
		.trim()
		.toLowerCase()
	if (code === "adult" || code === "child" || code === "infant") return code
	const explicit = String(ticket.pricingBucket ?? "")
		.trim()
		.toLowerCase()
	if (explicit === "adult" || explicit === "child" || explicit === "infant") return explicit
	const minAge = ticket.minAge == null ? null : Number(ticket.minAge)
	if (minAge != null && Number.isFinite(minAge)) {
		if (minAge >= 12) return "adult"
		if (minAge >= 3) return "child"
		return "infant"
	}
	// Documented MVP default: custom inherits the adult bucket until specific pricing exists.
	return "adult"
}

export function normalizeTicketQuantity(value: unknown): number {
	const n = Math.floor(Number(value ?? 0))
	if (!Number.isFinite(n) || n < 0) return 0
	return n
}

/**
 * Build occupancyDetail from ticket quantities + product ticket definitions.
 * Inactive bands are ignored. Unknown codes are skipped.
 */
export function tourTicketsToOccupancyDetail(params: {
	tickets: TourTicketBand[]
	quantities: TourTicketQuantities
}): TourOccupancyDetail {
	const out: TourOccupancyDetail = { adults: 0, children: 0, infants: 0 }
	for (const ticket of params.tickets ?? []) {
		if (ticket.isActive === false) continue
		const code = String(ticket.code ?? "").trim()
		if (!code) continue
		const qty = normalizeTicketQuantity(params.quantities[code])
		if (qty <= 0) continue
		const bucket = resolveTourTicketPricingBucket(ticket)
		if (bucket === "adult") out.adults += qty
		else if (bucket === "child") out.children += qty
		else out.infants += qty
	}
	// Hold/search require at least 1 adult in the commercial spine.
	if (out.adults < 1 && out.children + out.infants > 0) {
		out.adults = 1
		if (out.children > 0) out.children -= 1
		else out.infants = Math.max(0, out.infants - 1)
	}
	if (out.adults < 1) out.adults = 1
	return out
}

/** MVP cupo: one inventory unit per ticket purchased. */
export function tourCupoUnits(params: {
	tickets: TourTicketBand[]
	quantities: TourTicketQuantities
}): number {
	let total = 0
	for (const ticket of params.tickets ?? []) {
		if (ticket.isActive === false) continue
		const code = String(ticket.code ?? "").trim()
		if (!code) continue
		total += normalizeTicketQuantity(params.quantities[code])
	}
	return Math.max(1, total)
}

export function parseTourTicketQuantitiesFromSearchParams(
	params: URLSearchParams
): TourTicketQuantities {
	return {
		adult: normalizeTicketQuantity(params.get("adults") ?? params.get("adult") ?? 1),
		child: normalizeTicketQuantity(params.get("children") ?? params.get("child") ?? 0),
		infant: normalizeTicketQuantity(params.get("infants") ?? params.get("infant") ?? 0),
		custom: normalizeTicketQuantity(params.get("custom") ?? 0),
	}
}

export type AgeBandPriceRow = {
	code: string
	label: string
	bucket: "adult" | "child" | "infant"
	quantity: number
	unitAmount: number | null
	lineTotal: number | null
	inheritsAdultPricing: boolean
}

/**
 * Rough guest-facing breakdown from RatePlanOccupancyPolicy fields.
 * Not a second pricing engine — illustrative until ticket-specific rates exist.
 */
export function buildAgeBandPriceBreakdown(params: {
	tickets: TourTicketBand[]
	quantities: TourTicketQuantities
	policy: {
		baseAmount: number
		baseAdults: number
		baseChildren: number
		extraAdultValue?: number | null
		childMode?: string | null
		childValue?: number | null
	} | null
}): { rows: AgeBandPriceRow[]; note: string } {
	const baseAmount = Number(params.policy?.baseAmount ?? NaN)
	const baseAdults = Math.max(1, Number(params.policy?.baseAdults ?? 1))
	const adultUnit = Number.isFinite(baseAmount)
		? Number((baseAmount / baseAdults).toFixed(2))
		: null
	const childMode = String(params.policy?.childMode ?? "fixed").toLowerCase()
	const childValue = Number(params.policy?.childValue ?? NaN)
	const childUnit =
		adultUnit == null
			? null
			: childMode === "percent" && Number.isFinite(childValue)
				? Number(((adultUnit * childValue) / 100).toFixed(2))
				: Number.isFinite(childValue)
					? Number(childValue.toFixed(2))
					: adultUnit
	const infantUnit = childUnit == null ? null : Number((childUnit * 0).toFixed(2))

	const unitFor = (bucket: "adult" | "child" | "infant") =>
		bucket === "adult" ? adultUnit : bucket === "child" ? childUnit : infantUnit

	const rows: AgeBandPriceRow[] = []
	for (const ticket of params.tickets ?? []) {
		if (ticket.isActive === false) continue
		const code = String(ticket.code ?? "").trim()
		if (!code) continue
		const quantity = normalizeTicketQuantity(params.quantities[code])
		if (quantity <= 0) continue
		const bucket = resolveTourTicketPricingBucket(ticket)
		const unitAmount = unitFor(bucket)
		rows.push({
			code,
			label: String(ticket.label ?? code),
			bucket,
			quantity,
			unitAmount,
			lineTotal: unitAmount == null ? null : Number((unitAmount * quantity).toFixed(2)),
			inheritsAdultPricing: code === "custom" && bucket === "adult",
		})
	}

	return {
		rows,
		note: "Custom hereda el bucket de pricing configurado (adulto por defecto) hasta existir tarifas por ticket.",
	}
}
