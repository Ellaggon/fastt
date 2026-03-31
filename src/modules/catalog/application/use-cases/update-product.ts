import { z } from "zod"

const bodySchema = z.object({
	name: z.string().min(1, "El nombre es requerido."),
	description: z.string().nullable().optional(),
	productType: z.enum(["Tour", "Package", "Hotel"]),
	subtype: z.record(z.any()).optional(),
})

export async function updateProduct(params: {
	updateProductAndSubtype: (
		productId: string,
		providerId: string,
		productFields: Record<string, any>,
		subtypeType?: "hotel" | "tour" | "package",
		subtypePayload?: Record<string, any>
	) => Promise<any>
	productId: string
	providerId: string
	formData: FormData
}): Promise<Response> {
	const { updateProductAndSubtype, productId, providerId, formData } = params

	const plain = Object.fromEntries(formData.entries())

	let parsedPayload: any
	try {
		parsedPayload = {
			name: (plain as any).name ? String((plain as any).name).trim() : "",
			description:
				(plain as any).description !== undefined
					? String((plain as any).description).trim()
					: undefined,
			productType: (plain as any).productType ? String((plain as any).productType).trim() : "Tour",
			subtype: (plain as any).subtype ? JSON.parse(String((plain as any).subtype)) : undefined,
		}
	} catch (e) {
		return new Response(JSON.stringify({ error: "Invalid JSON in subtype" }), { status: 400 })
	}

	// Parsear y validar los datos del formulario
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
}
