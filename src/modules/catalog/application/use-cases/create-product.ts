import type { ProductRepositoryPort } from "../ports/ProductRepositoryPort"

export interface CreateProductDeps {
	repo: ProductRepositoryPort
}

export async function createProduct(
	deps: CreateProductDeps,
	params: {
		id: string
		name: string
		description: string | null
		productType: string
		providerId: string | null
		destinationId: string
		images: string[]
	}
): Promise<{ id: string }> {
	await deps.repo.createProductWithImages({
		id: params.id,
		name: params.name,
		description: params.description,
		productType: params.productType,
		providerId: params.providerId,
		destinationId: params.destinationId,
		images: params.images,
	})

	return { id: params.id }
}
