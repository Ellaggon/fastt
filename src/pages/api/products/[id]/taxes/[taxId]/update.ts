import type { APIRoute } from "astro"
import { db, TaxFee, eq } from "astro:db"

export const PUT: APIRoute = async ({ params, request }) => {
	const { id: productId, taxId } = params
	const body = await request.json()

	if (!productId || !taxId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const { name, type, value, currency, isIncluded, isActive } = body

	await db
		.update(TaxFee)
		.set({
			name,
			type,
			value,
			currency,
			isIncluded,
			isActive,
		})
		.where(eq(TaxFee.id, taxId))

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
