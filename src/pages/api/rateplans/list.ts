import type { APIRoute } from "astro"
import { db, RatePlan, eq } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	try {
		const variantId = url.searchParams.get("variantId")

		if (variantId) {
			const rows = await db.select().from(RatePlan).where(eq(RatePlan.variantId, variantId)).all()

			return new Response(JSON.stringify(rows), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}

		const rows = await db.select().from(RatePlan).all()
		return new Response(JSON.stringify(rows), { status: 200 })
	} catch (e) {
		console.error("rateplans:list", e)
		return new Response(JSON.stringify({ error: "Server error" }), {
			status: 500,
		})
	}
}
