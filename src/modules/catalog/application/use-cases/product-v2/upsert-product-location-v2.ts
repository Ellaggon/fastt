import type { ProductV2RepositoryPort } from "../../ports/ProductV2RepositoryPort"
import { productLocationSchema } from "../../schemas/product-v2/productLocationSchema"

export async function upsertProductLocationV2(
	deps: { repo: ProductV2RepositoryPort },
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
