import type { APIRoute } from "astro"
import { db, eq, OperatingRule } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id

	if (!productId) {
		return new Response(JSON.stringify({ error: "Mising productId" }), { status: 400 })
	}

	const rules = await db.select().from(OperatingRule).where(eq(OperatingRule.productId, productId))

	return new Response(JSON.stringify({ rules }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
