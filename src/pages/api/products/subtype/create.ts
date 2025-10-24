import type { APIRoute } from "astro"
import {
	normalizeProductType,
	hotelSchema,
	tourSchema,
	packageSchema,
} from "@/schemas/product/subtype"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { ensureProductOwnedByProvider } from "@/lib/db/product"
import { insertHotel, insertTour, insertPackage, subtypeExists } from "@/lib/db/subtype"
import { db } from "astro:db"

export const POST: APIRoute = async ({ request }) => {
	try {
		// 1) obtener providerId
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		// 2) parse form data mínimo
		const form = await request.formData()
		const productId = String(form.get("productId") || "").trim()
		if (!productId)
			return new Response(JSON.stringify({ error: "productId required" }), { status: 400 })
		// const productType = normalizeProductType(form.get("productType"));

		// 3) verificar propiedad del producto
		const product = await ensureProductOwnedByProvider(productId, providerId)
		if (!product) {
			return new Response(JSON.stringify({ error: "Product not found or not owned by you" }), {
				status: 403,
			})
		}

		// Use DB productType as source of truth (normalize)
		const productType = normalizeProductType(product.productType)
		if (!["hotel", "tour", "package"].includes(productType)) {
			return new Response(JSON.stringify({ error: "Invalid product type in DB" }), { status: 400 })
		}

		// 4) prevenir duplicados
		const already = await subtypeExists(productId, productType as any)
		if (already) {
			return new Response(
				JSON.stringify({ error: "Subtype details already exist for this product" }),
				{ status: 400 }
			)
		}

		// 5) validar y crear según tipo
		if (productType === "hotel") {
			const payload = {
				productId,
				productType: "hotel",
				stars: form.get("stars"),
				address: form.get("address"),
				phone: form.get("phone"),
				email: form.get("email"),
				website: form.get("website"),
				checkInTime: form.get("checkInTime"),
				checkOutTime: form.get("checkOutTime"),
			}
			const parsed = hotelSchema.safeParse(payload)
			if (!parsed.success) {
				return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
			}
			await insertHotel(db, parsed.data)
			return new Response(JSON.stringify({ ok: true }), { status: 200 })
		}

		if (productType === "tour") {
			const payload = {
				productId,
				productType: "tour",
				duration: form.get("duration"),
				difficultyLevel: form.get("difficultyLevel"),
				guideLanguages: form.get("guideLanguages"),
				includes: form.get("includes"),
				excludes: form.get("excludes"),
			}
			const parsed = tourSchema.safeParse(payload)
			if (!parsed.success) {
				return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
			}
			await insertTour(db, parsed.data)
			return new Response(JSON.stringify({ ok: true }), { status: 200 })
		}

		// package
		const payload = {
			productId,
			productType: "package",
			itinerary: form.get("itinerary"),
			days: form.get("days"),
			nights: form.get("nights"),
		}
		const parsed = packageSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}
		await insertPackage(db, parsed.data)
		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (err) {
		console.error("subtype/create error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
