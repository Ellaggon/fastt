import type { ProductV2RepositoryPort } from "../../ports/ProductV2RepositoryPort"
import { productBaseSchema } from "../../schemas/product-v2/productBaseSchema"

export async function createProductV2(
	deps: { repo: ProductV2RepositoryPort },
	params: {
		id: string
		name: string
		productType: string
		description?: string | null
		providerId?: string | null
		destinationId: string
	}
): Promise<{ id: string }> {
	const parsed = productBaseSchema.parse({
		name: params.name,
		productType: params.productType,
		description: params.description ?? undefined,
		providerId: params.providerId ?? undefined,
		destinationId: params.destinationId,
	})

	await deps.repo.createProductBase({
		id: params.id,
		name: parsed.name,
		productType: parsed.productType,
		description: parsed.description ?? null,
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
