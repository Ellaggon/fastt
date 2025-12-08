import type { APIRoute } from "astro"
import { db, OperatingRule, eq } from "astro:db"

export const DELETE: APIRoute = async ({ params }) => {
	const productId = params.id
	const ruleId = params.ruleId

	if (!productId || !ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await db.delete(OperatingRule).where(eq(OperatingRule.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
