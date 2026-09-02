import type { ProductRepositoryPort } from "../../ports/ProductRepositoryPort"
import { productBaseSchema } from "../../schemas/product/productBaseSchema"
import { normalizeProductTypeForStorage } from "@/lib/catalog/productVerticalRegistry"

export async function createProduct(
	deps: { repo: ProductRepositoryPort },
	params: {
		id: string
		name: string
		productType: string
		providerId: string
		geoPlaceId: string
	}
): Promise<{ id: string }> {
	const parsed = productBaseSchema.parse({
		name: params.name,
		productType: params.productType,
		providerId: params.providerId,
		geoPlaceId: params.geoPlaceId,
	})
	const productType = normalizeProductTypeForStorage(parsed.productType)
	if (!productType) throw new Error("Unsupported product type")

	await deps.repo.createProductBase({
		id: params.id,
		name: parsed.name,
		productType,
		providerId: parsed.providerId,
		geoPlaceId: parsed.geoPlaceId,
	})

	return { id: params.id }
}
