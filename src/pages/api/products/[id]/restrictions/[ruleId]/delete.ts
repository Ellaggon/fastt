import type { APIRoute } from "astro"
import { db, Restriction, eq } from "astro:db"

export const DELETE: APIRoute = async ({ params }) => {
	const ruleId = params.ruleId

	if (!ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await db.delete(Restriction).where(eq(Restriction.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
