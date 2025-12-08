import type { APIRoute } from "astro"
import { db, Policy } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id

	if (!productId)
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })

	const body = await request.json()
	const { policyType, description, isActive } = body

	if (!policyType || !description) {
		return new Response(JSON.stringify({ error: "Mising fields" }), { status: 400 })
	}

	const newId = randomUUID()

	await db.insert(Policy).values({
		id: newId,
		productId,
		policyType,
		description,
		isActive: isActive ?? true,
	})
	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
