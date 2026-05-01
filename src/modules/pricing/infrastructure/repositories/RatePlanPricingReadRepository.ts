import {
	and,
	asc,
	count,
	db,
	desc,
	EffectivePricingV2,
	eq,
	lte,
	RatePlan,
	RatePlanOccupancyPolicy,
	sql,
} from "astro:db"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import type { RatePlanPricingReadRepositoryPort } from "../../application/ports/RatePlanPricingReadRepositoryPort"

const CANONICAL_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

export class RatePlanPricingReadRepository implements RatePlanPricingReadRepositoryPort {
	async getDefaultRatePlanPricingSummaryByVariant(variantId: string) {
		const plan = await db
			.select({ id: RatePlan.id, createdAt: RatePlan.createdAt })
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
		if (!plan?.id) return null
		return this.getRatePlanPricingSummary(String(plan.id))
	}

	async getRatePlanPricingSummary(ratePlanId: string) {
		const normalizedRatePlanId = String(ratePlanId ?? "").trim()
		if (!normalizedRatePlanId) return null

		const targetDate = new Date()
		const policy = await db
			.select({
				currency: RatePlanOccupancyPolicy.baseCurrency,
				basePrice: RatePlanOccupancyPolicy.baseAmount,
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

		const effectivePricingDays = Number(
			(
				await db
					.select({ value: count() })
					.from(EffectivePricingV2)
					.where(
						and(
							eq(EffectivePricingV2.ratePlanId, normalizedRatePlanId),
							eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY)
						)
					)
					.get()
			)?.value ?? 0
		)

		return {
			ratePlanId: normalizedRatePlanId,
			currency: String(policy.currency ?? "USD"),
			basePrice: Number(policy.basePrice ?? 0),
			effectivePricingDays,
			coverageOccupancyKey: CANONICAL_OCCUPANCY_KEY,
		}
	}
}
