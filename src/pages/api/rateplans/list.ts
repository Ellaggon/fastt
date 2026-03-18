import type { APIRoute } from "astro"
import { db, eq, inArray, RatePlan, RatePlanTemplate, Restriction } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	const variantId = url.searchParams.get("variantId")
	if (!variantId) {
		return new Response(JSON.stringify({ error: "Missing variantId" }), { status: 400 })
	}

	const ratePlans = await db.select().from(RatePlan).where(eq(RatePlan.variantId, variantId)).all()

	if (!ratePlans.length) {
		return new Response(JSON.stringify([]), { status: 200 })
	}

	const ratePlanIds = ratePlans.map((r) => r.id)
	const templateIds = [...new Set(ratePlans.map((r) => r.templateId))]

	const [templates, restrictions] = await Promise.all([
		db.select().from(RatePlanTemplate).where(inArray(RatePlanTemplate.id, templateIds)),

		db.select().from(Restriction).where(inArray(Restriction.scopeId, ratePlanIds)),
	])

	const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]))

	const restrictionMap = restrictions.reduce<Record<string, any[]>>((acc, r) => {
		if (!acc[r.scopeId]) acc[r.scopeId] = []
		acc[r.scopeId].push(r)
		return acc
	}, {})

	const result = ratePlans.map((rp) => {
		const rpRestrictions = restrictionMap[rp.id] ?? []

		// Convención: tomamos la primera restriction activa solo para fechas
		const baseRestriction = rpRestrictions.find((r) => r.isActive) ?? null

		return {
			...rp,
			template: templateMap[rp.templateId],
			restrictions: rpRestrictions,
			dateRange: baseRestriction
				? {
						startDate: baseRestriction.startDate,
						endDate: baseRestriction.endDate,
					}
				: null,
		}
	})

	return new Response(JSON.stringify(result), { status: 200 })
}
