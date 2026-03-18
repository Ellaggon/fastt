import type { APIRoute } from "astro"
import { db, eq, and, ProductService, ProductServiceAttribute } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { ensureProductOwnedByProvider } from "@/lib/db/product"

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

		// 1. Validar seguridad
		const product = await ensureProductOwnedByProvider(productId, providerId)
		if (!product) {
			return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
		}

		// 2. Extraer datos básicos
		const isIncluded = formData.get("isIncluded") === "on"
		const price = isIncluded ? null : Number(formData.get("price"))
		const priceUnit = isIncluded ? null : formData.get("priceUnit")?.toString()
		const currency = isIncluded ? null : formData.get("currency")?.toString()
		const appliesTo = formData.get("appliesTo")?.toString() || "both"
		const notes = formData.get("notes")?.toString()

		await db.transaction(async (tx) => {
			// 3. Actualizar tabla principal ProductService
			await tx
				.update(ProductService)
				.set({
					price,
					priceUnit,
					currency,
					appliesTo,
					notes,
				})
				.where(eq(ProductService.id, psId))

			// 4. Procesar Atributos Dinámicos (los que empiezan con attr_)
			// Primero borramos los anteriores para este servicio
			await tx
				.delete(ProductServiceAttribute)
				.where(eq(ProductServiceAttribute.productServiceId, psId))

			const attributeInserts = []
			for (const [key, value] of formData.entries()) {
				if (key.startsWith("attr_") && value) {
					const attrKey = key.replace("attr_", "")
					attributeInserts.push({
						id: crypto.randomUUID(),
						productServiceId: psId,
						key: attrKey,
						value: value.toString(),
					})
				}
			}

			if (attributeInserts.length > 0) {
				await tx.insert(ProductServiceAttribute).values(attributeInserts)
			}
		})

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (err) {
		console.error("Update error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
