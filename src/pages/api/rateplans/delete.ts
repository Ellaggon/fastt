import type { APIRoute } from "astro"
import { db, RatePlan, eq } from "astro:db"

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		const qsId = url.searchParams.get("id")
		let id = qsId

		if (!id) {
			const body = await request.json().catch(() => null)
			id = body?.id
		}

		if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })

		await db.delete(RatePlan).where(eq(RatePlan.id, id))

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (e) {
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
