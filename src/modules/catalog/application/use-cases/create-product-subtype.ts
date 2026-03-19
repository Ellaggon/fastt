import {
	normalizeProductType,
	hotelSchema,
	tourSchema,
	packageSchema,
} from "@/schemas/product/subtype"
import { db } from "astro:db"

export async function createProductSubtype(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	subtypeExists: (productId: string, subtype: "hotel" | "tour" | "package") => Promise<boolean>
	insertHotel: (dbOrTx: any, data: any) => Promise<any>
	insertTour: (dbOrTx: any, data: any) => Promise<any>
	insertPackage: (dbOrTx: any, data: any) => Promise<any>
	providerId: string
	form: FormData
}): Promise<Response> {
	const { ensureOwned, subtypeExists, insertHotel, insertTour, insertPackage, providerId, form } =
		params

	const productId = String(form.get("productId") || "").trim()
	if (!productId)
		return new Response(JSON.stringify({ error: "productId required" }), { status: 400 })

	// verificar propiedad del producto
	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Product not found or not owned by you" }), {
			status: 403,
		})
	}

	// Use DB productType as source of truth (normalize)
	const productType = normalizeProductType((product as any).productType)
	if (!["hotel", "tour", "package"].includes(productType)) {
		return new Response(JSON.stringify({ error: "Invalid product type in DB" }), { status: 400 })
	}

	// prevenir duplicados
	const already = await subtypeExists(productId, productType as any)
	if (already) {
		return new Response(
			JSON.stringify({ error: "Subtype details already exist for this product" }),
			{
				status: 400,
			}
		)
	}

	// validar y crear según tipo
	if (productType === "hotel") {
		const payload = {
			productId,
			productType: "hotel",
			stars: form.get("stars"),
			address: form.get("address"),
			phone: form.get("phone"),
			email: form.get("email"),
			website: form.get("website"),
			latitude: form.get("latitude") ? Number(form.get("latitude")) : null,
			longitude: form.get("longitude") ? Number(form.get("longitude")) : null,
		}
		const parsed = hotelSchema.safeParse(payload)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}
		await insertHotel(db as any, parsed.data as any)
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
		await insertTour(db as any, parsed.data as any)
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
	await insertPackage(db as any, parsed.data as any)
	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
