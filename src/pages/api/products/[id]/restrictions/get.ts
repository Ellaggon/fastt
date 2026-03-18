import type { APIRoute } from "astro"
import { db, eq, and, or, desc, Restriction, Variant, RatePlan } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id

	if (!productId) {
		return new Response(JSON.stringify({ error: "Mising productId" }), { status: 400 })
	}

	const rows = await db
		.select()
		.from(Restriction)
		.leftJoin(RatePlan, eq(Restriction.scopeId, RatePlan.id))
		.leftJoin(Variant, eq(RatePlan.variantId, Variant.id))
		.where(
			or(
				and(eq(Restriction.scope, "product"), eq(Restriction.scopeId, productId)),
				and(eq(Restriction.scope, "variant"), eq(Variant.productId, productId)),
				and(eq(Restriction.scope, "rate_plan"), eq(Variant.productId, productId))
			)
		)
		.orderBy(desc(Restriction.priority))

	const restrictions = rows.map((row) => row.Restriction)

	return new Response(JSON.stringify({ restrictions }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
