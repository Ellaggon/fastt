import type { APIRoute } from "astro"
import { db, eq, Policy } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id

	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const policies = await db.select().from(Policy).where(eq(Policy.productId, productId)).all()

	return new Response(JSON.stringify({ policies }), {
		headers: { "Content-Type": "application/json" },
	})
}
