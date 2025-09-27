import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { deleteProductCascade, ensureProductOwnedByProvider } from "@/lib/db/product"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		const productId = String(body?.productId || "").trim()
		if (!productId) return new Response("productId required", { status: 400 })

		// obtener providerId desde la sesión
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response("Unauthorized", { status: 401 })

		// 3. Verificar que el producto pertenezca al proveedor
		const product = await ensureProductOwnedByProvider(productId, String(providerId))
		if (!product) return new Response("Not found or not owned", { status: 403 })

		// 4. Eliminar el producto de la base de datos
		await deleteProductCascade(productId)

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("products/delete error:", e)
		return new Response("Server error", { status: 500 })
	}
}
