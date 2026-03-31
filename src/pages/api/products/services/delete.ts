import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { productRepository, productServiceRepository } from "@/container"
import { deleteProductService } from "@/modules/catalog/public"
import { requireAuth } from "@/lib/auth/requireAuth"

export const POST: APIRoute = async ({ request }) => {
	try {
		await requireAuth(request, {
			unauthorizedResponse: new Response("Unauthorized", { status: 401 }),
		})
	} catch (e) {
		if (e instanceof Response) return e
		throw e
	}

	const { productId, serviceId } = await request.json()

	if (!productId || !serviceId) {
		return new Response("Missing identifiers", { status: 400 })
	}

	// 🔒 Verificar provider
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response("Provider not found", { status: 403 })
	}

	return deleteProductService({
		ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
		repo: productServiceRepository,
		providerId,
		productId,
		serviceId,
	})
}
