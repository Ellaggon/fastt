type RatePlanOfferIdentity = {
	ratePlanId: string
	variantId: string
	ratePlanName: string
	productId?: string
	variantName?: string
	isDefault?: boolean
	isActive?: boolean
	createdAt?: string | Date | null
	pricingReadiness?: { hasBasePrice?: boolean }
}

const CURRENCY_SUFFIX = /\s·\s[A-Z]{3}$/

/** Extra accepted currencies are prices of the same tariff, not extra calendar tariffs. */
function commercialRateName(name: string) {
	return name.trim().replace(CURRENCY_SUFFIX, "")
}

function offerKey(row: RatePlanOfferIdentity) {
	const rateName = commercialRateName(String(row.ratePlanName ?? ""))
	const productId = String(row.productId ?? "").trim()
	const variantName = String(row.variantName ?? "").trim()
	if (productId && variantName) return `${productId}\0${variantName}\0${rateName}`
	return `${row.variantId}\0${rateName}`
}

function createdAtMillis(row: RatePlanOfferIdentity) {
	if (!row.createdAt) return Number.POSITIVE_INFINITY
	const time =
		row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt))
	return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function offerRank(row: RatePlanOfferIdentity) {
	return (
		(row.isDefault ? 4 : 0) + (row.isActive ? 2 : 0) + (row.pricingReadiness?.hasBasePrice ? 1 : 0)
	)
}

/** One tariff per departure. Extra currencies and repeated saves stay behind the original. */
export function distinctRatePlanOffers<T extends RatePlanOfferIdentity>(
	rows: T[],
	selectedRatePlanId?: string | null
): T[] {
	const selected = String(selectedRatePlanId ?? "").trim()
	const groups = new Map<string, T[]>()
	for (const row of rows) {
		const key = offerKey(row)
		const bucket = groups.get(key)
		if (bucket) bucket.push(row)
		else groups.set(key, [row])
	}
	return [...groups.values()].map((bucket) => {
		const original = bucket.reduce((best, row) => {
			const byCreated = createdAtMillis(row) - createdAtMillis(best)
			if (byCreated < 0) return row
			if (byCreated > 0) return best
			return offerRank(row) > offerRank(best) ? row : best
		})
		const requested = selected ? bucket.find((row) => row.ratePlanId === selected) : undefined
		// A repeated save of the same currency can stay open. Another currency of the same tariff cannot.
		if (
			requested &&
			String(requested.ratePlanName ?? "").trim() === String(original.ratePlanName ?? "").trim()
		) {
			return requested
		}
		return original
	})
}

export function findReusableRatePlan<T extends RatePlanOfferIdentity>(
	rows: T[],
	variantId: string,
	name: string
): T | null {
	const matches = rows.filter(
		(row) => row.variantId === variantId && String(row.ratePlanName ?? "").trim() === name.trim()
	)
	// Reuse stays on the same departure. Display grouping must not attach a price to another salida.
	return distinctRatePlanOffers(matches)[0] ?? null
}
