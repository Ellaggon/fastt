import {
	and,
	db,
	eq,
	inArray,
	Product,
	RatePlan,
	RatePlanTemplate,
	Restriction,
	PriceRule,
	Variant,
} from "astro:db"
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

	async listByProvider(providerId: string): Promise<unknown[]> {
		const rows = await db
			.select({
				ratePlanId: RatePlan.id,
				variantId: Variant.id,
				variantName: Variant.name,
				productId: Product.id,
				productName: Product.name,
				ratePlanName: RatePlanTemplate.name,
				isActive: RatePlan.isActive,
				isDefault: RatePlan.isDefault,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.innerJoin(RatePlanTemplate, eq(RatePlanTemplate.id, RatePlan.templateId))
			.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))
			.all()

		if (!rows.length) return []

		const ratePlanIds = rows.map((row) => String(row.ratePlanId))
		const variantIds = [...new Set(rows.map((row) => String(row.variantId)))]
		const productIds = [...new Set(rows.map((row) => String(row.productId)))]
		const [priceRules, restrictions] = await Promise.all([
			db
				.select({ ratePlanId: PriceRule.ratePlanId })
				.from(PriceRule)
				.where(inArray(PriceRule.ratePlanId, ratePlanIds))
				.all(),
			db
				.select({
					scope: Restriction.scope,
					scopeId: Restriction.scopeId,
					isActive: Restriction.isActive,
				})
				.from(Restriction)
				.where(inArray(Restriction.scopeId, [...ratePlanIds, ...variantIds, ...productIds]))
				.all(),
		])

		const priceRulesCountByRatePlanId = priceRules.reduce<Record<string, number>>((acc, row) => {
			const key = String(row.ratePlanId)
			acc[key] = (acc[key] ?? 0) + 1
			return acc
		}, {})
		const activeRestrictionsCountByRatePlanId = rows.reduce<Record<string, number>>((acc, row) => {
			const ratePlanId = String(row.ratePlanId)
			const variantId = String(row.variantId)
			const productId = String(row.productId)
			acc[ratePlanId] = restrictions.filter((restriction) => {
				if (!restriction.isActive) return false
				const scope = String(restriction.scope)
				const scopeId = String(restriction.scopeId)
				return (
					(scope === "rate_plan" && scopeId === ratePlanId) ||
					(scope === "variant" && scopeId === variantId) ||
					(scope === "product" && scopeId === productId)
				)
			}).length
			return acc
		}, {})

		return rows
			.map((row) => {
				const ratePlanId = String(row.ratePlanId)
				const priceRulesCount = Number(priceRulesCountByRatePlanId[ratePlanId] ?? 0)
				const activeRestrictionsCount = Number(activeRestrictionsCountByRatePlanId[ratePlanId] ?? 0)
				return {
					ratePlanId,
					ratePlanName: String(row.ratePlanName ?? "Rate plan"),
					productId: String(row.productId),
					productName: String(row.productName ?? ""),
					variantId: String(row.variantId),
					variantName: String(row.variantName ?? ""),
					isActive: Boolean(row.isActive),
					isDefault: Boolean(row.isDefault),
					status: Boolean(row.isActive) ? "active" : "inactive",
					summary: {
						priceRulesCount,
						activeRestrictionsCount,
					},
				}
			})
			.sort((a, b) => {
				const byProduct = a.productName.localeCompare(b.productName)
				if (byProduct !== 0) return byProduct
				const byVariant = a.variantName.localeCompare(b.variantName)
				if (byVariant !== 0) return byVariant
				return a.ratePlanName.localeCompare(b.ratePlanName)
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

		const product = await db
			.select({ productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, ratePlan.variantId))
			.get()

		const restrictionScopeIds = [ratePlan.id, ratePlan.variantId, product?.productId]
			.map((value) => String(value ?? "").trim())
			.filter(Boolean)
		const restrictions = restrictionScopeIds.length
			? await db
					.select()
					.from(Restriction)
					.where(inArray(Restriction.scopeId, restrictionScopeIds))
					.all()
			: []

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
