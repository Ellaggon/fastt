import type { ProductServiceRepositoryPort } from "../ports/ProductServiceRepositoryPort"

export async function updateProductService(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	repo: ProductServiceRepositoryPort
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
		repo,
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

	await repo.updateProductService({
		psId,
		price,
		priceUnit,
		currency,
		appliesTo,
		notes,
		attributes,
	})

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
