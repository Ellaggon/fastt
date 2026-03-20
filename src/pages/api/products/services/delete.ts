import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { productRepository, productServiceRepository } from "@/container"
import { getSession } from "auth-astro/server"
import { deleteProductService } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	const session = await getSession(request)
	if (!session?.user?.email) {
		return new Response("Unauthorized", { status: 401 })
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
