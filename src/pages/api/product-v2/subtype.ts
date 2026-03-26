import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { createProductSubtype } from "@/modules/catalog/public"
import { productRepository, subtypeRepository } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		return createProductSubtype({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			subtypeExists: (pid, subtype) => subtypeRepository.subtypeExists(pid, subtype),
			insertHotel: (data) => subtypeRepository.insertHotelStandalone(data as any),
			insertTour: (data) => subtypeRepository.insertTourStandalone(data as any),
			insertPackage: (data) => subtypeRepository.insertPackageStandalone(data as any),
			providerId,
			form,
		})
	} catch (err) {
		console.error("product-v2/subtype error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
