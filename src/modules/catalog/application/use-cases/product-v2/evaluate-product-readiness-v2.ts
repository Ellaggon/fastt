import type {
	ProductV2RepositoryPort,
	ProductV2StatusState,
} from "../../ports/ProductV2RepositoryPort"

type ValidationError = { code: string; message: string }

export async function evaluateProductReadinessV2(
	deps: { repo: ProductV2RepositoryPort },
	params: { productId: string }
): Promise<{
	productId: string
	state: ProductV2StatusState
	validationErrors: ValidationError[]
}> {
	const agg = await deps.repo.getProductAggregate(params.productId)
	if (!agg) throw new Error("Product not found")

	const errors: ValidationError[] = []

	// Identity checks (minimal): must have name/productType already, but keep it defensive.
	if (!agg.product.name || String(agg.product.name).trim().length < 1) {
		errors.push({ code: "missing_name", message: "Product name is required" })
	}
	if (!agg.product.productType || String(agg.product.productType).trim().length < 1) {
		errors.push({ code: "missing_product_type", message: "Product type is required" })
	}

	// Content checks
	const highlights = (agg.content?.highlightsJson as unknown) ?? null
	if (!Array.isArray(highlights) || highlights.length < 1) {
		errors.push({ code: "missing_content", message: "At least one highlight is required" })
	}

	// Location checks
	const lat = agg.location?.lat ?? null
	const lng = agg.location?.lng ?? null
	if (typeof lat !== "number" || typeof lng !== "number") {
		errors.push({ code: "missing_location", message: "Location coordinates are required" })
	}

	// Images checks
	if (!agg.imagesCount || agg.imagesCount < 1) {
		errors.push({ code: "missing_images", message: "At least one image is required" })
	}

	// Subtype checks
	if (!agg.subtypeExists) {
		errors.push({ code: "missing_subtype", message: "Subtype details are required" })
	}

	const state: ProductV2StatusState = errors.length === 0 ? "ready" : "draft"

	await deps.repo.upsertProductStatus({
		productId: params.productId,
		state,
		validationErrorsJson: errors.length === 0 ? null : errors,
	})

	return { productId: params.productId, state, validationErrors: errors }
}
