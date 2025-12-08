import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { updateProductAndSubtype } from "@/lib/services/productService"
import { z } from "zod"

const bodySchema = z.object({
	name: z.string().min(1, "El nombre es requerido."),
	description: z.string().nullable().optional(),
	productType: z.enum(["Tour", "Package", "Hotel"]),
	subtype: z.record(z.any()).optional(),
})

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const productId = String(params.id || "")
		if (!productId)
			return new Response(JSON.stringify({ error: "Missing product ID in URL" }), { status: 400 })

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const formData = await request.formData()
		const plain = Object.fromEntries(formData.entries())

		let parsedPayload
		try {
			parsedPayload = {
				name: plain.name ? String(plain.name).trim() : "",
				description: plain.description !== undefined ? String(plain.description).trim() : undefined,
				productType: plain.productType ? String(plain.productType).trim() : "Tour",
				subtype: plain.subtype ? JSON.parse(String(plain.subtype)) : undefined,
			}
		} catch (e) {
			return new Response(JSON.stringify({ error: "Invalid JSON in subtype" }), { status: 400 })
		}

		// 2. Parsear y validar los datos del formulario
		const parsed = bodySchema.safeParse(parsedPayload)
		if (!parsed.success)
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })

		const productFields: Record<string, any> = {}
		productFields.name = parsed.data.name
		if (parsed.data.description !== undefined) productFields.description = parsed.data.description
		if (parsed.data.productType !== undefined) productFields.productType = parsed.data.productType
		productFields.lastUpdated = new Date()

		// solo tocar subtipo si viene en el form
		const hasSubtype = parsed.data.subtype !== undefined
		const subtypeType = hasSubtype
			? (String(parsed.data.productType).toLowerCase() as "hotel" | "tour" | "package")
			: undefined
		const subtypePayload = parsed.data.subtype ?? undefined

		// Orquestador (transaccional)
		await updateProductAndSubtype(productId, providerId, productFields, subtypeType, subtypePayload)

		let redirectUrl = "/dashboard"
		if (parsed.data.productType === "Hotel") redirectUrl = `/hotels/${productId}`
		if (parsed.data.productType === "Tour") redirectUrl = `/tours/${productId}`
		if (parsed.data.productType === "Package") redirectUrl = `/packages/${productId}`

		return new Response(JSON.stringify({ ok: true, redirectUrl }), { status: 200 })
	} catch (e) {
		console.error("Error al actualizar el producto: ", e)
		return new Response(JSON.stringify({ error: "Error al procesar la solicitud" }), {
			status: 500,
		})
	}
}
