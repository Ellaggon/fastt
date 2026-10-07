/** Stable conditions entry; the server resolves the owned option and rate there. */
export function tourConditionsHref(
	productId: string,
	selection: { variantId?: string | null; ratePlanId?: string | null } = {}
) {
	const params = new URLSearchParams()
	if (selection.variantId) params.set("variantId", selection.variantId)
	if (selection.ratePlanId) params.set("ratePlanId", selection.ratePlanId)
	return `/product/${encodeURIComponent(productId)}/conditions${params.size ? `?${params}` : ""}`
}
