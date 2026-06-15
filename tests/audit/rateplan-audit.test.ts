import { describe, expect, it } from "vitest"
import {
	and,
	CommercialRule,
	CommercialRuleApplication,
	db,
	eq,
	notInArray,
	sql,
	RatePlan,
	Variant,
} from "astro:db"

function toInt(v: unknown): number {
	if (typeof v === "number") return v
	if (typeof v === "bigint") return Number(v)
	if (typeof v === "string") return Number(v)
	return Number(v ?? 0)
}

describe("audit/rateplan data (read-only)", () => {
	it("prints modern RatePlan/CommercialRule audit report", async () => {
		const [{ n: ratePlanCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlan)
				.all()) ?? []
		const [{ n: commercialRuleCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(CommercialRule)
				.all()) ?? []
		const [{ n: commercialRuleApplicationCount }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(CommercialRuleApplication)
				.all()) ?? []

		const invalidRuleTypes = await db
			.select({ type: CommercialRule.type, n: sql<number>`count(*)` })
			.from(CommercialRule)
			.where(
				and(
					eq(CommercialRule.category, "price"),
					notInArray(CommercialRule.type, [
						"fixed_override",
						"fixed_adjustment",
						"percentage_discount",
						"percentage_markup",
					])
				)
			)
			.groupBy(CommercialRule.type)
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

		const [{ n: orphanCommercialRatePlanApplications }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(CommercialRuleApplication)
				.leftJoin(RatePlan, eq(CommercialRuleApplication.scopeId, RatePlan.id))
				.where(and(eq(CommercialRuleApplication.scope, "rate_plan"), sql`${RatePlan.id} is null`))
				.all()) ?? []

		const [{ n: orphanRatePlansByVariant }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlan)
				.leftJoin(Variant, eq(RatePlan.variantId, Variant.id))
				.where(sql`${Variant.id} is null`)
				.all()) ?? []

		const [{ n: unnamedRatePlans }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlan)
				.where(sql`"RatePlan"."name" is null or trim("RatePlan"."name") = ''`)
				.all()) ?? []

		const report = {
			counts: {
				ratePlans: toInt(ratePlanCount),
				commercialRules: toInt(commercialRuleCount),
				commercialRuleApplications: toInt(commercialRuleApplicationCount),
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
				commercialRatePlanApplicationsWithoutRatePlan: toInt(orphanCommercialRatePlanApplications),
				ratePlansWithoutVariant: toInt(orphanRatePlansByVariant),
				ratePlansWithoutName: toInt(unnamedRatePlans),
			},
		}

		expect(report.counts.ratePlans).toBeGreaterThanOrEqual(0)
		expect(report.orphans.ratePlansWithoutName).toBeGreaterThanOrEqual(0)
		expect(report.orphans.commercialRatePlanApplicationsWithoutRatePlan).toBeGreaterThanOrEqual(0)
		// eslint-disable-next-line no-console
		console.log("[rateplan-audit]", JSON.stringify(report, null, 2))
	})
})
