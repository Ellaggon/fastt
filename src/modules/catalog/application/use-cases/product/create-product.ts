import type { ProductRepositoryPort } from "../../ports/ProductRepositoryPort"
import { productBaseSchema } from "../../schemas/product/productBaseSchema"
import { normalizeProductTypeForStorage } from "@/lib/productVerticalRegistry"

export async function createProduct(
	deps: { repo: ProductRepositoryPort },
	params: {
		id: string
		name: string
		productType: string
		providerId?: string | null
		destinationId: string
	}
): Promise<{ id: string }> {
	const parsed = productBaseSchema.parse({
		name: params.name,
		productType: params.productType,
		providerId: params.providerId ?? undefined,
		destinationId: params.destinationId,
	})
	const productType = normalizeProductTypeForStorage(parsed.productType)
	if (!productType) throw new Error("Unsupported product type")

	await deps.repo.createProductBase({
		id: params.id,
		name: parsed.name,
		productType,
		providerId: parsed.providerId ?? null,
		destinationId: parsed.destinationId,
	})

	await deps.repo.upsertProductStatus({
		productId: params.id,
		state: "draft",
		validationErrorsJson: null,
	})

	return { id: params.id }
}
