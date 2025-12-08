import type { APIRoute } from "astro"
import { db, TaxFee } from "astro:db"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const body = await request.json()

	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const { name, type, value, currency, isIncluded, isActive } = body

	await db.insert(TaxFee).values({
		id: crypto.randomUUID(),
		productId,
		name,
		type,
		value,
		currency,
		isIncluded,
		isActive,
		createdAt: new Date(),
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
