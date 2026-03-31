import { db, eq, inArray, RatePlan, RatePlanTemplate, Restriction, PriceRule } from "astro:db"
import type { RatePlanQueryRepositoryPort } from "../../application/ports/RatePlanQueryRepositoryPort"

export class RatePlanQueryRepository implements RatePlanQueryRepositoryPort {
	async listByVariant(variantId: string): Promise<unknown[]> {
		const ratePlans = await db
			.select()
			.from(RatePlan)
			.where(eq(RatePlan.variantId, variantId))
			.all()

		if (!ratePlans.length) {
			return []
		}

		const ratePlanIds = ratePlans.map((r) => r.id)
		const templateIds = [...new Set(ratePlans.map((r) => r.templateId))]

		const [templates, restrictions] = await Promise.all([
			db.select().from(RatePlanTemplate).where(inArray(RatePlanTemplate.id, templateIds)),
			db.select().from(Restriction).where(inArray(Restriction.scopeId, ratePlanIds)),
		])

		const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]))

		type RestrictionRow = (typeof restrictions)[number]
		const restrictionMap = restrictions.reduce<Record<string, RestrictionRow[]>>((acc, r) => {
			if (!acc[r.scopeId]) acc[r.scopeId] = []
			acc[r.scopeId].push(r)
			return acc
		}, {})

		return ratePlans.map((rp) => {
			const rpRestrictions = restrictionMap[rp.id] ?? []
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
	}

	async getById(ratePlanId: string): Promise<unknown | null> {
		const ratePlan = await db.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()

		if (!ratePlan) {
			return null
		}

		const template = await db
			.select()
			.from(RatePlanTemplate)
			.where(eq(RatePlanTemplate.id, ratePlan.templateId))
			.get()

		const priceRules = await db
			.select()
			.from(PriceRule)
			.where(eq(PriceRule.ratePlanId, ratePlan.id))
			.all()

		const restrictions = await db
			.select()
			.from(Restriction)
			.where(eq(Restriction.scopeId, ratePlan.id))
			.all()

		const baseRestriction = restrictions.find((r) => r.isActive) ?? null

		return {
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
		}
	}
}
