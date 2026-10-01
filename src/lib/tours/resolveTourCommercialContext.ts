export type TourOfferOption = {
	variantId: string
	name: string
	bookingMode: "shared" | "private" | null
	lifecycleState: string
	salesEnabled: boolean
	hasProfile: boolean
	hasCapacity: boolean
	rates: Array<{ ratePlanId: string; name: string; isActive: boolean; isDefault: boolean }>
}
export type TourSelectionHint = { variantId?: string | null; ratePlanId?: string | null }
export type TourContextResolution = {
	productId: string
	options: TourOfferOption[]
	variantId: string | null
	ratePlanId: string | null
} & (
	| {
			status: "resolved"
			source: "url" | "session" | "sole_option"
			option: TourOfferOption
			rate: TourOfferOption["rates"][number]
	  }
	| {
			status: "unresolved"
			reason: "missing_option" | "missing_rate" | "selection_required" | "invalid_selection"
	  }
)

/** Only owned product options enter this function. URL intent must never be repaired by guessing. */
export function resolveTourCommercialContext(input: {
	productId: string
	options: TourOfferOption[]
	url?: TourSelectionHint
	session?: TourSelectionHint
}): TourContextResolution {
	const options = input.options.filter((option) => option.lifecycleState !== "archived")
	const base = { productId: input.productId, options, variantId: null, ratePlanId: null }
	const select = (
		hint: TourSelectionHint,
		source: "url" | "session" | "sole_option"
	): TourContextResolution => {
		const variantId = hint.variantId?.trim() || null
		const ratePlanId = hint.ratePlanId?.trim() || null
		const matches = options
			.flatMap((option) => option.rates.map((rate) => ({ option, rate })))
			.filter(
				({ option, rate }) =>
					(!variantId || option.variantId === variantId) &&
					(!ratePlanId || rate.ratePlanId === ratePlanId)
			)
		if (variantId && !options.some((option) => option.variantId === variantId))
			return { ...base, status: "unresolved", reason: "invalid_selection" }
		if (ratePlanId && matches.length === 0)
			return { ...base, status: "unresolved", reason: "invalid_selection" }
		if (matches.length === 1) {
			const { option, rate } = matches[0]
			return {
				...base,
				status: "resolved",
				source,
				option,
				rate,
				variantId: option.variantId,
				ratePlanId: rate.ratePlanId,
			}
		}
		if (variantId && matches.length === 0)
			return { ...base, variantId, status: "unresolved", reason: "missing_rate" }
		if (!options.length) return { ...base, status: "unresolved", reason: "missing_option" }
		// A second option without a rate is still a choice. Do not pick the sole priced option.
		if (!variantId && !ratePlanId && options.length > 1)
			return { ...base, status: "unresolved", reason: "selection_required" }
		if (options.length === 1 && !options[0].rates.length)
			return {
				...base,
				variantId: options[0].variantId,
				status: "unresolved",
				reason: "missing_rate",
			}
		return { ...base, variantId, status: "unresolved", reason: "selection_required" }
	}
	if (input.url?.variantId?.trim() || input.url?.ratePlanId?.trim()) return select(input.url, "url")
	if (input.session?.variantId?.trim() || input.session?.ratePlanId?.trim()) {
		const saved = select(input.session, "session")
		if (saved.status === "resolved" || saved.reason !== "invalid_selection") return saved
	}
	// Unhinted resolution requires a unique option AND a unique rate, even if one is default.
	if (options.length > 1) return { ...base, status: "unresolved", reason: "selection_required" }
	return select({}, "sole_option")
}

export function tourSelectionReturnTo(productId: string, requested: string | null): string {
	const fallback = `/product/${encodeURIComponent(productId)}/preview`
	try {
		const target = new URL(requested ?? fallback, "http://fastt.local")
		if (
			target.origin !== "http://fastt.local" ||
			requested?.includes("\\") ||
			target.pathname.endsWith("/select-offer")
		)
			return fallback
		if (
			!target.pathname.startsWith(`/product/${encodeURIComponent(productId)}/`) &&
			!["/rates/plans/manage", "/rates/calendar"].includes(target.pathname)
		)
			return fallback
		if (target.pathname.startsWith("/rates/")) target.searchParams.set("productId", productId)
		return `${target.pathname}${target.search}${target.hash}`
	} catch {
		return fallback
	}
}

export function tourContextSelectionHref(context: TourContextResolution, returnTo: string): string {
	return `/product/${encodeURIComponent(context.productId)}/select-offer?${new URLSearchParams({ returnTo })}`
}

/** Contextual links use validated IDs; unrelated query parameters survive. */
export function withTourCommercialContext(href: string, context: TourContextResolution): string {
	const url = new URL(href, "http://fastt.local")
	if (url.origin !== "http://fastt.local") throw new Error("Expected a local tour link")
	url.searchParams.delete("variantId")
	url.searchParams.delete("ratePlanId")
	if (context.variantId) url.searchParams.set("variantId", context.variantId)
	if (context.ratePlanId) url.searchParams.set("ratePlanId", context.ratePlanId)
	return `${url.pathname}${url.search}${url.hash}`
}
