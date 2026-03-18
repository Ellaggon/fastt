import type { APIRoute } from "astro"
import { z } from "astro:content"
import { productRepository, subtypeRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { db } from "astro:db"

const schema = z.object({
	productId: z.string().min(1),
	subtypeType: z.enum(["hotel", "tour", "package"]),
	subtype: z.record(z.any()).optional(),
})
export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const body = await request.json()
		const parsed = schema.safeParse(body)
		if (!parsed.success)
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		const { productId, subtypeType, subtype } = parsed.data

		// ownership + product check
		const product = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!product)
			return new Response(JSON.stringify({ error: "Not found or not owned" }), { status: 403 })

		const prevType = String(product.productType || "").toLowerCase()
		if (subtypeType !== prevType) {
			return new Response(
				JSON.stringify({
					error:
						"Subtype type does not match product.productType. Change productType first in the product page.",
				}),
				{ status: 400 }
			)
		}

		// Upsert subtype inside a transaction
		await db.transaction(async (tx) => {
			const exists = await subtypeRepository.subtypeExists(
				tx as any,
				productId,
				subtypeType as "hotel" | "tour" | "package"
			)
			if (exists) {
				if (subtypeType === "hotel")
					await subtypeRepository.updateHotel(tx as any, productId, subtype || {})
				if (subtypeType === "tour")
					await subtypeRepository.updateTour(tx as any, productId, subtype || {})
				if (subtypeType === "package")
					await subtypeRepository.updatePackage(tx as any, productId, subtype || {})
			} else {
				if (subtypeType === "hotel")
					await subtypeRepository.insertHotel(tx as any, { productId, ...(subtype || {}) } as any)
				if (subtypeType === "tour")
					await subtypeRepository.insertTour(tx as any, { productId, ...(subtype || {}) } as any)
				if (subtypeType === "package")
					await subtypeRepository.insertPackage(tx as any, { productId, ...(subtype || {}) } as any)
			}
		})

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("update-subtype error:", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
