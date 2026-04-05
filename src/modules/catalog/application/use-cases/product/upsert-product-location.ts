import type { ProductRepositoryPort } from "../../ports/ProductRepositoryPort"
import { productLocationSchema } from "../../schemas/product/productLocationSchema"

export async function upsertProductLocation(
	deps: { repo: ProductRepositoryPort },
	params: {
		productId: string
		address?: string | null
		lat: unknown
		lng: unknown
	}
): Promise<{ productId: string }> {
	const parsed = productLocationSchema.parse({
		productId: params.productId,
		address: params.address ?? undefined,
		lat: params.lat,
		lng: params.lng,
	})

	await deps.repo.upsertProductLocation({
		productId: parsed.productId,
		address: parsed.address ?? null,
		lat: parsed.lat,
		lng: parsed.lng,
	})

	return { productId: parsed.productId }
}
