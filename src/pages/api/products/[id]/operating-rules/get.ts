import type { APIRoute } from "astro"
import { db, eq, desc, OperatingRule } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id

	if (!productId) {
		return new Response(JSON.stringify({ error: "Mising productId" }), { status: 400 })
	}

	const rules = await db
		.select()
		.from(OperatingRule)
		.where(eq(OperatingRule.productId, productId))
		.orderBy(desc(OperatingRule.priority))

	return new Response(JSON.stringify({ rules }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
