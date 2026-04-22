import { describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	notInArray,
	sql,
	RatePlan,
	RatePlanTemplate,
	PriceRule,
	Restriction,
	Variant,
} from "astro:db"

function toInt(v: unknown): number {
	if (typeof v === "number") return v
	if (typeof v === "bigint") return Number(v)
	if (typeof v === "string") return Number(v)
	return Number(v ?? 0)
}

describe("audit/rateplan data (read-only)", () => {
	it("prints modern RatePlan/PriceRule/Restriction audit report", async () => {
		const [{ n: ratePlanCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlan)
				.all()) ?? []
		const [{ n: templateCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlanTemplate)
				.all()) ?? []
		const [{ n: priceRuleCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(PriceRule)
				.all()) ?? []
		const [{ n: restrictionCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(Restriction)
				.all()) ?? []

		const invalidRuleTypes = await db
			.select({ type: PriceRule.type, n: sql<number>`count(*)` })
			.from(PriceRule)
			.where(notInArray(PriceRule.type, ["percentage", "fixed"]))
			.groupBy(PriceRule.type)
			.all()

		const perVariant = await db
			.select({
				variantId: RatePlan.variantId,
				totalPlans: sql<number>`count(*)`,
				defaultPlans: sql<number>`sum(case when ${RatePlan.isDefault} = 1 then 1 else 0 end)`,
			})
			.from(RatePlan)
			.groupBy(RatePlan.variantId)
			.all()

		const variantsWithMultiplePlans = perVariant
			.map((r: any) => ({
				variantId: String(r.variantId),
				totalPlans: toInt(r.totalPlans),
				defaultPlans: toInt(r.defaultPlans),
			}))
			.filter((r) => r.totalPlans > 1)
			.sort((a, b) => b.totalPlans - a.totalPlans)

		const variantsWithoutExactlyOneDefault = perVariant
			.map((r: any) => ({
				variantId: String(r.variantId),
				totalPlans: toInt(r.totalPlans),
				defaultPlans: toInt(r.defaultPlans),
			}))
			.filter((r) => r.defaultPlans !== 1)
			.sort((a, b) => b.totalPlans - a.totalPlans)

		const [{ n: orphanPriceRules }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(PriceRule)
				.leftJoin(RatePlan, eq(PriceRule.ratePlanId, RatePlan.id))
				.where(sql`${RatePlan.id} is null`)
				.all()) ?? []

		const [{ n: orphanRatePlansByVariant }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlan)
				.leftJoin(Variant, eq(RatePlan.variantId, Variant.id))
				.where(sql`${Variant.id} is null`)
				.all()) ?? []

		const [{ n: orphanTemplates }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlanTemplate)
				.leftJoin(RatePlan, eq(RatePlan.templateId, RatePlanTemplate.id))
				.where(sql`${RatePlan.id} is null`)
				.all()) ?? []

		const [{ n: orphanRatePlanRestrictions }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(Restriction)
				.leftJoin(RatePlan, eq(Restriction.scopeId, RatePlan.id))
				.where(and(eq(Restriction.scope, "rate_plan"), sql`${RatePlan.id} is null`))
				.all()) ?? []

		const report = {
			counts: {
				ratePlans: toInt(ratePlanCount),
				ratePlanTemplates: toInt(templateCount),
				priceRules: toInt(priceRuleCount),
				restrictions: toInt(restrictionCount),
			},
			legacyDetections: {
				invalidPriceRuleTypes: invalidRuleTypes.map((r: any) => ({
					type: String(r.type),
					count: toInt(r.n),
				})),
				variantsWithMultiplePlans: {
					count: variantsWithMultiplePlans.length,
					sample: variantsWithMultiplePlans.slice(0, 20),
				},
				variantsWithoutExactlyOneDefault: {
					count: variantsWithoutExactlyOneDefault.length,
					sample: variantsWithoutExactlyOneDefault.slice(0, 20),
				},
			},
			orphans: {
				priceRulesWithoutRatePlan: toInt(orphanPriceRules),
				ratePlansWithoutVariant: toInt(orphanRatePlansByVariant),
				templatesNotLinkedToRatePlan: toInt(orphanTemplates),
				ratePlanRestrictionsWithoutRatePlan: toInt(orphanRatePlanRestrictions),
			},
		}

		expect(report.counts.ratePlans).toBeGreaterThanOrEqual(0)
		expect(report.counts.ratePlanTemplates).toBeGreaterThanOrEqual(0)
		expect(report.orphans.priceRulesWithoutRatePlan).toBeGreaterThanOrEqual(0)
		// eslint-disable-next-line no-console
		console.log("[rateplan-audit]", JSON.stringify(report, null, 2))
	})
})
