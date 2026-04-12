import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProduct } from "@/lib/cache/invalidation"
import { updateProductSubtype } from "@/modules/catalog/public"
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
		const productId = String(form.get("productId") ?? "").trim()
		if (!productId) {
			return new Response(JSON.stringify({ error: "productId required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Product not found or not owned by you" }), {
				status: 403,
				headers: { "Content-Type": "application/json" },
			})
		}

		const subtypeType = String((owned as any).productType ?? "")
			.trim()
			.toLowerCase() as "hotel" | "tour" | "package"

		if (!["hotel", "tour", "package"].includes(subtypeType)) {
			return new Response(JSON.stringify({ error: "Invalid product type in DB" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const subtype =
			subtypeType === "hotel"
				? {
						stars: form.get("stars") ? Number(form.get("stars")) : null,
						phone: String(form.get("phone") ?? "").trim() || null,
						email: String(form.get("email") ?? "").trim() || null,
						website: String(form.get("website") ?? "").trim() || null,
					}
				: subtypeType === "tour"
					? {
							duration: String(form.get("duration") ?? "").trim() || null,
							difficultyLevel: String(form.get("difficultyLevel") ?? "").trim() || null,
							guideLanguages: String(form.get("guideLanguages") ?? "")
								.split(",")
								.map((item) => item.trim())
								.filter(Boolean),
							includes: String(form.get("includes") ?? "").trim() || null,
							excludes: String(form.get("excludes") ?? "").trim() || null,
						}
					: {
							itinerary: String(form.get("itinerary") ?? "").trim() || null,
							days: form.get("days") ? Number(form.get("days")) : null,
							nights: form.get("nights") ? Number(form.get("nights")) : null,
						}

		const response = await updateProductSubtype({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			runInTransaction: (fn) => subtypeRepository.runInTransaction(fn),
			subtypeExists: (dbOrTx, pid, subtypeName) =>
				subtypeRepository.subtypeExists(dbOrTx, pid, subtypeName),
			updateHotel: (dbOrTx, pid, data) => subtypeRepository.updateHotel(dbOrTx, pid, data),
			updateTour: (dbOrTx, pid, data) => subtypeRepository.updateTour(dbOrTx, pid, data),
			updatePackage: (dbOrTx, pid, data) => subtypeRepository.updatePackage(dbOrTx, pid, data),
			insertHotel: (dbOrTx, data) => subtypeRepository.insertHotel(dbOrTx, data as any),
			insertTour: (dbOrTx, data) => subtypeRepository.insertTour(dbOrTx, data as any),
			insertPackage: (dbOrTx, data) => subtypeRepository.insertPackage(dbOrTx, data as any),
			providerId,
			productId,
			subtypeType,
			subtype,
		})
		if (response.ok) await invalidateProduct(productId)
		return response
	} catch (err) {
		console.error("product/subtype error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
