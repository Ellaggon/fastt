import type { APIRoute } from "astro"
import { db, eq, and, ProductService, ProductServiceAttribute } from "astro:db"
import { generateOtaText } from "@/lib/services/generateOtaText"

export const POST: APIRoute = async ({ request }) => {
	console.log("API UPDATE HIT")
	try {
		const formData = await request.formData()

		const productId = String(formData.get("productId") ?? "")
		const serviceId = String(formData.get("serviceId") ?? "")
		const psId = String(formData.get("psId") ?? "")

		if (!productId || !serviceId || !psId) {
			return new Response(JSON.stringify({ error: "Missing identifiers" }), { status: 400 })
		}

		// ─── Flags principales ─────────────────────────────
		const isIncluded = formData.get("isIncluded") === "on"
		const isPaid = formData.get("isPaid") === "on"

		const price = isPaid ? Number(formData.get("price") || 0) : null
		const priceUnit = isPaid ? String(formData.get("priceUnit") || "") : null
		const currency = isPaid ? String(formData.get("currency") || "") : null

		const appliesTo = String(formData.get("appliesTo") || "both")

		let customText = String(formData.get("customText") || "").trim()

		// ─── Atributos dinámicos ──────────────────────────
		const attrMap: Record<string, string> = {}

		for (const [key, value] of formData.entries()) {
			if (key.startsWith("attr_")) {
				const attrKey = key.replace("attr_", "")
				attrMap[attrKey] = String(value)
			}
		}

		// ─── Generar texto OTA si está vacío ──────────────
		if (!customText) {
			customText = generateOtaText(serviceId, attrMap)
		}

		// ─── Transacción ─────────────────────────────────
		await db.transaction(async (tx) => {
			// 1️⃣ Update ProductService
			await tx
				.update(ProductService)
				.set({
					isIncluded,
					isPaid,
					price,
					priceUnit,
					currency,
					appliesTo,
					customText,
				})
				.where(
					and(
						eq(ProductService.id, psId),
						eq(ProductService.productId, productId),
						eq(ProductService.serviceId, serviceId)
					)
				)

			// 2️⃣ Borrar atributos anteriores
			await tx
				.delete(ProductServiceAttribute)
				.where(eq(ProductServiceAttribute.productServiceId, psId))

			// 3️⃣ Insertar nuevos atributos
			const entries = Object.entries(attrMap).filter(([_, value]) => value !== "" && value !== null)

			if (entries.length > 0) {
				await tx.insert(ProductServiceAttribute).values(
					entries.map(([key, value]) => ({
						id: crypto.randomUUID(),
						productServiceId: psId,
						key,
						value,
					}))
				)
			}
		})

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (err) {
		console.error(err)
		return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
	}
}
