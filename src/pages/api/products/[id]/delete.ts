import type { APIRoute } from "astro"
import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { deleteProduct } from "@/modules/catalog/application/use-cases/delete-product"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		const productId = String(body?.productId || "").trim()
		if (!productId) return new Response("productId required", { status: 400 })

		// obtener providerId desde la sesión
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response("Unauthorized", { status: 401 })

		return deleteProduct({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			deleteCascade: (pid) => productRepository.deleteProductCascade(pid),
			productId,
			providerId,
		})
	} catch (e) {
		console.error("products/delete error:", e)
		return new Response("Server error", { status: 500 })
	}
}
