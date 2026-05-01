import { and, asc, db, desc, eq, lte, RatePlan, RatePlanOccupancyPolicy, sql } from "astro:db"
import type { BaseRateRepositoryPort } from "../../application/ports/BaseRateRepositoryPort"

export class BaseRateRepository implements BaseRateRepositoryPort {
	private readonly runtimeBaseByVariant = new Map<
		string,
		{
			variantId: string
			ratePlanId: string
			currency: string
			basePrice: number
			createdAt: Date
		}
	>()

	async getCanonicalBaseByRatePlanId(ratePlanId: string) {
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

	async setCanonicalBaseForRatePlan(params: {
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
		const nowDateOnly = now.toISOString().slice(0, 10)
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
			effectiveFrom: nowDateOnly,
			effectiveTo: "2099-12-31",
			createdAt: now,
		} as any)
	}

	// Compatibility adapter: variantId no longer decides pricing; it only resolves owner ratePlanId.
	async getCanonicalBaseByVariantId(variantId: string) {
		const legacyRatePlanId = `legacy-variant:${variantId}`
		const plan = await db
			.select({ ratePlanId: RatePlan.id })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.orderBy(asc(RatePlan.createdAt), asc(RatePlan.id))
			.get()
		if (!plan?.ratePlanId) return this.runtimeBaseByVariant.get(variantId) ?? null
		const canonical = await this.getCanonicalBaseByRatePlanId(String(plan.ratePlanId))
		if (!canonical) return this.runtimeBaseByVariant.get(variantId) ?? null

		return {
			variantId,
			ratePlanId: String(plan.ratePlanId),
			currency: canonical.currency,
			basePrice: canonical.basePrice,
			createdAt: canonical.createdAt ?? new Date(),
		}
	}

	// Compatibility adapter: maps legacy variant-level call to default active ratePlan.
	async setCanonicalBaseForVariant(params: {
		variantId: string
		currency: string
		basePrice: number
	}): Promise<void> {
		const now = new Date()
		const normalizedCurrency = String(params.currency || "USD")
			.trim()
			.toUpperCase()
		const normalizedBasePrice = Number(params.basePrice)
		this.runtimeBaseByVariant.set(params.variantId, {
			variantId: params.variantId,
			ratePlanId: `legacy-variant:${params.variantId}`,
			currency: normalizedCurrency,
			basePrice: normalizedBasePrice,
			createdAt: now,
		})
		const plan = await db
			.select({ ratePlanId: RatePlan.id })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, params.variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.orderBy(asc(RatePlan.createdAt), asc(RatePlan.id))
			.get()
		if (!plan?.ratePlanId) {
			return
		}
		await this.setCanonicalBaseForRatePlan({
			ratePlanId: String(plan.ratePlanId),
			currency: normalizedCurrency,
			basePrice: normalizedBasePrice,
		})
	}
}
