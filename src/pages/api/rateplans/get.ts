import type { APIRoute } from "astro"
import { db, RatePlan, eq } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	try {
		const id = url.searchParams.get("id")
		if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })

		const row = await db.select().from(RatePlan).where(eq(RatePlan.id, id)).get()

		if (!row) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

		return new Response(JSON.stringify(row), { status: 200 })
	} catch (e) {
		console.error("rateplans:get", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
