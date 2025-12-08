import type { APIRoute } from "astro"
import { db, OperatingRule, eq } from "astro:db"

export const PUT: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const ruleId = params.ruleId

	if (!productId || !ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const body = await request.json()
	const { ruleType, value } = body

	if (!ruleType || !value) {
		return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
	}

	await db.update(OperatingRule).set({ ruleType, value }).where(eq(OperatingRule.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
