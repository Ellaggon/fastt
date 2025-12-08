import type { APIRoute } from "astro"
import { db, Policy, eq } from "astro:db"

export const PUT: APIRoute = async ({ params, request }) => {
	const { id: productId, policyId } = params
	const body = await request.json()

	const { policyType, description, isActive } = body

	if (!productId || !policyId)
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })

	await db
		.update(Policy)
		.set({
			policyType,
			description,
			isActive,
		})
		.where(eq(Policy.id, policyId))

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
