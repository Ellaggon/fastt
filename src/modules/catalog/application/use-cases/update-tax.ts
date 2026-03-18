import { db, TaxFee, eq } from "astro:db"

export async function updateTax(params: {
	productId: string
	taxId: string
	type: any
	value: any
	currency: any
	isIncluded: any
	isActive: any
}): Promise<Response> {
	const { productId, taxId, type, value, currency, isIncluded, isActive } = params

	if (!productId || !taxId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await db
		.update(TaxFee)
		.set({
			type,
			value,
			currency,
			isIncluded,
			isActive,
		})
		.where(eq(TaxFee.id, taxId))

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
