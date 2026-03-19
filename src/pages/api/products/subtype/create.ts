import type { APIRoute } from "astro"
import { productRepository, subtypeRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { createProductSubtype } from "@/modules/catalog/application/use-cases/create-product-subtype"

export const POST: APIRoute = async ({ request }) => {
	try {
		// 1) obtener providerId
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		const form = await request.formData()
		return createProductSubtype({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			subtypeExists: (pid, subtype) => subtypeRepository.subtypeExists(pid, subtype),
			insertHotel: (dbOrTx, data) => subtypeRepository.insertHotel(dbOrTx, data),
			insertTour: (dbOrTx, data) => subtypeRepository.insertTour(dbOrTx, data),
			insertPackage: (dbOrTx, data) => subtypeRepository.insertPackage(dbOrTx, data),
			providerId,
			form,
		})
	} catch (err) {
		console.error("subtype/create error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
