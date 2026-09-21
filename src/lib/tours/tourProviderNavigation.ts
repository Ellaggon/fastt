export type TourCommercialContext = {
	productId: string
	variantId?: string | null
	ratePlanId?: string | null
}

function withQuery(path: string, values: Record<string, string | null | undefined>): string {
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(values)) {
		const normalized = String(value ?? "").trim()
		if (normalized) params.set(key, normalized)
	}
	const query = params.toString()
	return `${path}${query ? `?${query}` : ""}`
}

export function buildTourCommercialLinks(context: TourCommercialContext) {
	const productId = String(context.productId)
	const variantId = String(context.variantId ?? "").trim()
	const ratePlanId = String(context.ratePlanId ?? "").trim()
	return {
		departuresHref: `/product/${encodeURIComponent(productId)}/departures`,
		participantsHref: `/product/${encodeURIComponent(productId)}/tickets`,
		categoriesHref: `/product/${encodeURIComponent(productId)}/categories`,
		priceHref: ratePlanId
			? withQuery(`/rates/plans/${encodeURIComponent(ratePlanId)}`, {
					vista: "price",
					productId,
					variantId,
					ratePlanId,
				})
			: withQuery("/rates/plans/manage", {
					productId,
					variantId,
					openDialog: "1",
				}),
		conditionsHref: ratePlanId
			? withQuery(`/rates/plans/${encodeURIComponent(ratePlanId)}`, {
					vista: "conditions",
					productId,
					variantId,
					ratePlanId,
				})
			: withQuery("/rates/plans/manage", { productId, variantId }),
		calendarHref: withQuery("/rates/calendar", {
			focus: "availability",
			productId,
			variantId,
			ratePlanId,
		}),
	}
}

type ProductHubCommercialSurface = {
	defaultRatePlanIds?: readonly string[] | null
}

export function buildTourCommercialLinksForProductHub(params: {
	productId: string
	variantId?: string | null
	operationalSurface?: ProductHubCommercialSurface | null
}) {
	return buildTourCommercialLinks({
		productId: params.productId,
		variantId: params.variantId,
		ratePlanId: params.operationalSurface?.defaultRatePlanIds?.[0] ?? null,
	})
}
