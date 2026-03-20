import type { APIRoute } from "astro"
import { productRepository, productServiceRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProductService } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const { serviceId } = params
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId || !serviceId) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}

		const formData = await request.formData()
		const psId = formData.get("psId")?.toString()
		const productId = formData.get("productId")?.toString()

		if (!psId || !productId) {
			return new Response(JSON.stringify({ error: "Missing IDs" }), { status: 400 })
		}

		// 2. Extraer datos básicos (parsing)
		const isIncluded = formData.get("isIncluded") === "on"
		const price = isIncluded ? null : Number(formData.get("price"))
		const priceUnit = isIncluded ? null : formData.get("priceUnit")?.toString()
		const currency = isIncluded ? null : formData.get("currency")?.toString()
		const appliesTo = formData.get("appliesTo")?.toString() || "both"
		const notes = formData.get("notes")?.toString()
		return updateProductService({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			repo: productServiceRepository,
			providerId,
			productId,
			psId,
			price,
			priceUnit: priceUnit ?? null,
			currency: currency ?? null,
			appliesTo,
			notes,
			formData,
		})
	} catch (err) {
		console.error("Update error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
