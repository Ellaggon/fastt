import type { APIRoute } from "astro"
import { db, eq, RatePlan, RatePlanTemplate, PriceRule, Restriction } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	const id = url.searchParams.get("id")
	if (!id) {
		return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
	}

	// 1️⃣ RatePlan
	const ratePlan = await db.select().from(RatePlan).where(eq(RatePlan.id, id)).get()

	if (!ratePlan) {
		return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
	}

	// 2️⃣ Template
	const template = await db
		.select()
		.from(RatePlanTemplate)
		.where(eq(RatePlanTemplate.id, ratePlan.templateId))
		.get()

	// 3️⃣ Price Rules
	const priceRules = await db
		.select()
		.from(PriceRule)
		.where(eq(PriceRule.ratePlanId, ratePlan.id))
		.all()

	// 4️⃣ Restrictions (🔥 reemplaza ApplicabilityRule)
	const restrictions = await db
		.select()
		.from(Restriction)
		.where(eq(Restriction.scopeId, ratePlan.id))
		.all()

	// Convención: una restriction activa define el rango
	const baseRestriction = restrictions.find((r) => r.isActive) ?? null

	return new Response(
		JSON.stringify({
			...ratePlan,
			template,
			priceRules,
			restrictions,
			dateRange: baseRestriction
				? {
						startDate: baseRestriction.startDate,
						endDate: baseRestriction.endDate,
					}
				: null,
		}),
		{ status: 200 }
	)
}
