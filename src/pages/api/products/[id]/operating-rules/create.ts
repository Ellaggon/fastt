import type { APIRoute } from "astro"
import { db, OperatingRule } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id

	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const body = await request.json()
	const { ruleType, value } = body

	if (!ruleType || !value) {
		return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
	}

	const newId = randomUUID()

	await db.insert(OperatingRule).values({
		id: newId,
		productId,
		ruleType,
		value,
	})

	return new Response(JSON.stringify({ success: true, id: newId }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
