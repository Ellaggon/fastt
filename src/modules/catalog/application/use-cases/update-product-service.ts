import { db, eq, ProductService, ProductServiceAttribute } from "astro:db"

export async function updateProductService(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	providerId: string
	productId: string
	psId: string
	price: number | null
	priceUnit: string | null
	currency: string | null
	appliesTo: string
	notes: string | undefined
	formData: FormData
}): Promise<Response> {
	const {
		ensureOwned,
		providerId,
		productId,
		psId,
		price,
		priceUnit,
		currency,
		appliesTo,
		notes,
		formData,
	} = params

	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
	}

	const attributes: { key: string; value: string }[] = []
	for (const [key, value] of formData.entries()) {
		if (key.startsWith("attr_") && value) {
			const attrKey = key.replace("attr_", "")
			attributes.push({ key: attrKey, value: value.toString() })
		}
	}

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

		if (attributes.length > 0) {
			await tx.insert(ProductServiceAttribute).values(
				attributes.map((a) => ({
					id: crypto.randomUUID(),
					productServiceId: psId,
					key: a.key,
					value: a.value,
				}))
			)
		}
	})

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
