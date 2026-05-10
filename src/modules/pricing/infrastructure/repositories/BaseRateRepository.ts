import { and, db, desc, eq, lte, RatePlanOccupancyPolicy, sql } from "astro:db"
import type {
	RatePlanPricingBaselineRepositoryPort,
	CanonicalPricingBaselineSnapshot,
} from "../../application/ports/RatePlanPricingBaselineRepositoryPort"

export class BaseRateRepository implements RatePlanPricingBaselineRepositoryPort {
	async getCanonicalPricingBaselineByRatePlanId(
		ratePlanId: string
	): Promise<CanonicalPricingBaselineSnapshot | null> {
		const normalizedRatePlanId = String(ratePlanId ?? "").trim()
		if (!normalizedRatePlanId) return null
		const targetDate = new Date()
		const policy = await db
			.select({
				basePrice: RatePlanOccupancyPolicy.baseAmount,
				currency: RatePlanOccupancyPolicy.currency,
				createdAt: RatePlanOccupancyPolicy.createdAt,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, normalizedRatePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
					sql`${RatePlanOccupancyPolicy.effectiveTo} > ${targetDate}`
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.get()
		if (!policy) return null
		return {
			ratePlanId: normalizedRatePlanId,
			currency: String(policy.currency ?? "USD"),
			basePrice: Number(policy.basePrice ?? 0),
			createdAt: policy.createdAt ?? new Date(),
		}
	}

	async setCanonicalPricingBaselineForRatePlan(params: {
		ratePlanId: string
		currency: string
		basePrice: number
	}): Promise<void> {
		const normalizedRatePlanId = String(params.ratePlanId ?? "").trim()
		if (!normalizedRatePlanId) return
		const now = new Date()
		const normalizedCurrency = String(params.currency || "USD")
			.trim()
			.toUpperCase()
		const normalizedBasePrice = Number(params.basePrice)
		const existingPolicy = await db
			.select({ id: RatePlanOccupancyPolicy.id })
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, normalizedRatePlanId),
					eq(RatePlanOccupancyPolicy.baseAdults, 2),
					eq(RatePlanOccupancyPolicy.baseChildren, 0)
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.get()
		if (existingPolicy?.id) {
			await db
				.update(RatePlanOccupancyPolicy)
				.set({
					baseAmount: normalizedBasePrice,
					baseCurrency: normalizedCurrency,
					currency: normalizedCurrency,
				})
				.where(eq(RatePlanOccupancyPolicy.id, existingPolicy.id))
			return
		}
		await db.insert(RatePlanOccupancyPolicy).values({
			id: crypto.randomUUID(),
			ratePlanId: normalizedRatePlanId,
			baseAdults: 2,
			baseChildren: 0,
			extraAdultMode: "fixed",
			extraAdultValue: 0,
			childMode: "fixed",
			childValue: 0,
			currency: normalizedCurrency,
			baseAmount: normalizedBasePrice,
			baseCurrency: normalizedCurrency,
			effectiveFrom: now,
			effectiveTo: new Date("2099-12-31T00:00:00.000Z"),
			createdAt: now,
		} as any)
	}
}
