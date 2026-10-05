export class PreparationSessionError extends Error {
	constructor(
		public code: string,
		public status = 400
	) {
		super(code)
	}
}
/** The saved URL may only resume this product and this exact selection. */
export function preparationPathContext(input: {
	productId: string
	lastPath: string
	variantId?: string | null
	ratePlanId?: string | null
}) {
	const path = input.lastPath
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
		throw new PreparationSessionError("invalid_preparation_path")
	const url = new URL(path, "http://fastt.local")
	if (/%2f|%5c/i.test(url.pathname)) throw new PreparationSessionError("invalid_preparation_path")
	let segments: string[]
	try {
		segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)
	} catch {
		throw new PreparationSessionError("invalid_preparation_path")
	}
	const productPath = segments[0] === "product" && segments[1] === input.productId
	const ratesPath =
		url.pathname === "/rates/calendar" ||
		url.pathname === "/rates/plans/manage" ||
		(segments[0] === "rates" && segments[1] === "plans" && segments.length === 3)
	if (!productPath && !ratesPath)
		throw new PreparationSessionError("preparation_path_product_mismatch")
	const queryProduct = url.searchParams.get("productId")
	if (queryProduct && queryProduct !== input.productId)
		throw new PreparationSessionError("preparation_path_product_mismatch")
	const match = (provided: string | null | undefined, fromPath: string | null) => {
		if (provided && fromPath && provided !== fromPath)
			throw new PreparationSessionError("preparation_path_selection_mismatch")
		return provided || fromPath || null
	}
	let variantId = match(input.variantId, url.searchParams.get("variantId"))
	let ratePlanId = match(input.ratePlanId, url.searchParams.get("ratePlanId"))
	if (productPath && segments[2] === "departures" && segments[3] && segments[3] !== "new")
		variantId = match(variantId, segments[3])
	if (ratesPath && segments.length === 3 && segments[2] !== "manage")
		ratePlanId = match(ratePlanId, segments[2])
	if (ratesPath) url.searchParams.set("productId", input.productId)
	return { url, variantId, ratePlanId, explicitSelection: Boolean(variantId || ratePlanId) }
}
