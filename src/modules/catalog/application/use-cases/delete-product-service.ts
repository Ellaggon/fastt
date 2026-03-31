import type { ProductServiceRepositoryPort } from "../ports/ProductServiceRepositoryPort"

export async function deleteProductService(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	repo: ProductServiceRepositoryPort
	providerId: string
	productId: string
	serviceId: string
}): Promise<Response> {
	const { ensureOwned, repo, providerId, productId, serviceId } = params

	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response("Forbidden", { status: 403 })
	}

	await repo.deleteProductService({ productId, serviceId })

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
