import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/db/provider"
import { updateProductAndSubtype } from "@/lib/services/productService"
import { z } from "zod"

// Definir el esquema de validación para los datos entrantes
const bodySchema = z.object({
	name: z.string().min(1, "El nombre es requerido."),
	shortDescription: z.string().nullable().optional(),
	longDescription: z.string().nullable().optional(),
	productType: z.enum(["Tour", "Package", "Hotel"]),
	basePriceUSD: z.preprocess((v) => {
		if (typeof v === "string") return v === "" ? undefined : Number(v)
		return v
	}, z.number().min(0).optional()),
	basePriceBOB: z.preprocess((v) => {
		if (typeof v === "string") return v === "" ? undefined : Number(v)
		return v
	}, z.number().min(0).optional()),
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

		const maybeNum = (v: unknown): number | undefined => {
			if (v === undefined || v === null || String(v).trim() === "") return undefined
			const n = Number(String(v))
			return Number.isFinite(n) ? n : undefined
		}

		let parsedPayload
		try {
			parsedPayload = {
				name: plain.name ? String(plain.name).trim() : "",
				shortDescription:
					plain.shortDescription !== undefined ? String(plain.shortDescription).trim() : undefined,
				longDescription:
					plain.longDescription !== undefined ? String(plain.longDescription).trim() : undefined,
				productType: plain.productType ? String(plain.productType).trim() : "Tour",
				basePriceUSD: maybeNum(plain.basePriceUSD),
				basePriceBOB: maybeNum(plain.basePriceBOB),
				// parse subtype JSON only if fue enviado
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
		if (parsed.data.shortDescription !== undefined)
			productFields.shortDescription = parsed.data.shortDescription
		if (parsed.data.longDescription !== undefined)
			productFields.longDescription = parsed.data.longDescription
		if (parsed.data.productType !== undefined) productFields.productType = parsed.data.productType
		if (parsed.data.basePriceUSD !== undefined)
			productFields.basePriceUSD = parsed.data.basePriceUSD
		if (parsed.data.basePriceBOB !== undefined)
			productFields.basePriceBOB = parsed.data.basePriceBOB
		productFields.lastUpdated = new Date()

		// solo tocar subtipo si viene en el form
		const hasSubtype = parsed.data.subtype !== undefined
		const subtypeType = hasSubtype
			? (String(parsed.data.productType).toLowerCase() as "hotel" | "tour" | "package")
			: undefined
		const subtypePayload = parsed.data.subtype ?? undefined

		// Orquestador (transaccional)
		await updateProductAndSubtype(productId, providerId, productFields, subtypeType, subtypePayload)

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("Error al actualizar el producto: ", e)
		return new Response(JSON.stringify({ error: "Error al procesar la solicitud" }), {
			status: 500,
		})
	}
}
