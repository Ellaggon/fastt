import type { APIRoute } from "astro"
import { db, Policy, eq } from "astro:db"

export const DELETE: APIRoute = async ({ params }) => {
	const { id, policyId } = params

	if (!id || !policyId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	try {
		await db.delete(Policy).where(eq(Policy.id, policyId))

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		console.error("error: ", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
