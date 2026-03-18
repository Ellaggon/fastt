import { db, Restriction, eq } from "astro:db"

export async function deleteRestriction(ruleId: string): Promise<Response> {
	if (!ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await db.delete(Restriction).where(eq(Restriction.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
