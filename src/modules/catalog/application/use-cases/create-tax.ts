import { db, TaxFee } from "astro:db"

export async function createTax(params: {
	productId: string
	type: any
	value: any
	currency: any
	isIncluded: any
	isActive: any
}): Promise<Response> {
	const { productId, type, value, currency, isIncluded, isActive } = params

	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	await db.insert(TaxFee).values({
		id: crypto.randomUUID(),
		productId,
		type,
		value,
		currency,
		isIncluded,
		isActive,
		createdAt: new Date(),
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
