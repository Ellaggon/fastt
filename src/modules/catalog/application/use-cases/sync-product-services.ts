import type { ProductServiceRepositoryPort } from "../ports/ProductServiceRepositoryPort"
import { unknownServiceIds } from "@/data/service/service-registry"

export async function syncProductServices(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	repo: ProductServiceRepositoryPort
	providerId: string
	productId: string
	services: { serviceId: string }[]
}): Promise<Response> {
	const { ensureOwned, repo, providerId, productId, services } = params

	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
	}
	const unknownIds = unknownServiceIds(services.map((service) => service.serviceId))
	if (unknownIds.length) {
		return new Response(
			JSON.stringify({ error: "Unknown service codes", serviceIds: unknownIds }),
			{
				status: 400,
			}
		)
	}

	await repo.syncProductServices({ productId, services })

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
