import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProductAndSubtype } from "@/lib/services/productService"
import { updateProduct } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const productId = String(params.id || "")
		if (!productId)
			return new Response(JSON.stringify({ error: "Missing product ID in URL" }), { status: 400 })

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const formData = await request.formData()
		return updateProduct({
			updateProductAndSubtype,
			productId,
			providerId,
			formData,
		})
	} catch (e) {
		console.error("Error al actualizar el producto: ", e)
		return new Response(JSON.stringify({ error: "Error al procesar la solicitud" }), {
			status: 500,
		})
	}
}
