import { db, eq, RatePlan, RatePlanTemplate, Variant } from "astro:db"

export async function getRestrictionRatePlans(productId: string): Promise<Response> {
	const pid = String(productId || "")

	if (!pid) {
		return new Response(JSON.stringify({ ratePlans: [] }), { status: 400 })
	}

	const ratePlans = await db
		.select({
			id: RatePlan.id,
			name: RatePlanTemplate.name,
		})
		.from(RatePlan)
		.innerJoin(RatePlanTemplate, eq(RatePlan.templateId, RatePlanTemplate.id))
		.innerJoin(Variant, eq(RatePlan.variantId, Variant.id))
		.where(eq(Variant.productId, pid))
		.all()

	return new Response(JSON.stringify({ ratePlans }), { status: 200 })
}
