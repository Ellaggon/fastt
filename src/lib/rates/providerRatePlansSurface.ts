import {
	and,
	count,
	db,
	EffectiveAvailability,
	gte,
	inArray,
	lt,
	sql,
} from "@/shared/infrastructure/db/compat"

import { ratePlanPricingReadRepository } from "@/container"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import { fallbackRatePlanConditionsSummary } from "@/lib/policies/ratePlanConditionState"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"
import { REQUIRED_POLICY_CATEGORIES } from "@/modules/policies/public"
import { listRatePlansByProvider } from "@/modules/pricing/public"

export type RatePlanListItem = {
	ratePlanId: string
	ratePlanName: string
	description?: string | null
	productId: string
	productName: string
	variantId: string
	variantName: string
	isActive: boolean
	isDefault: boolean
	status: "active" | "inactive"
	summary: {
		priceRulesCount: number
		activeRestrictionsCount: number
	}
	pricingReadiness: {
		hasBasePrice: boolean
		basePrice: number | null
		currency: string | null
		effectivePricingDays: number
	}
	inventoryReadiness: {
		isReady: boolean
		coverageDays: number
		availableDays: number
		expectedDays: number
	}
	policyCoverage: {
		totalCategories: number
		coveredCategories: number
		missingCategories: string[]
		isComplete: boolean
		policyCoverageUpdatedAt?: string | null
	}
	policySummary: string
}

export type ProviderRatePlansSurface = {
	providerId: string
	checkIn: string
	checkOut: string
	ratePlans: RatePlanListItem[]
}

type BaseRatePlanRow = Omit<
	RatePlanListItem,
	"pricingReadiness" | "inventoryReadiness" | "policyCoverage" | "policySummary"
>

async function measured<TValue>(
	timing: ServerTimingRecorder | undefined,
	name: string,
	fn: () => Promise<TValue>
): Promise<TValue> {
	return timing ? timing.time(name, fn) : fn()
}

function countNights(checkIn: string, checkOut: string): number {
	const start = new Date(`${checkIn}T00:00:00.000Z`)
	const end = new Date(`${checkOut}T00:00:00.000Z`)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1
	return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
}

export async function buildProviderRatePlansSurface(input: {
	providerId: string
	checkIn: string
	checkOut: string
	timing?: ServerTimingRecorder
}): Promise<ProviderRatePlansSurface> {
	const providerId = String(input.providerId ?? "").trim()
	if (!providerId) throw new Error("Provider id is required")
	const checkIn = String(input.checkIn ?? "").trim()
	const checkOut = String(input.checkOut ?? "").trim()
	const key = cacheKeys.providerRatePlansSurface(providerId, checkIn, checkOut)
	const metricStart = input.timing?.metrics.length ?? 0
	const surfaceStartedAt = performance.now()

	const surface = await readThrough(key, cacheTtls.providerRatePlansSurface, () =>
		loadProviderRatePlansSurface({ providerId, checkIn, checkOut, timing: input.timing })
	)

	if (input.timing) {
		const recorded = new Set(input.timing.metrics.slice(metricStart).map((metric) => metric.name))
		if (!recorded.has("ratePlansBase")) {
			input.timing.add("ratePlansBase", performance.now() - surfaceStartedAt, "surface_cache_hit")
		}
		if (!recorded.has("pricing")) input.timing.add("pricing", 0, "surface_cache_hit")
		if (!recorded.has("inventory")) input.timing.add("inventory", 0, "surface_cache_hit")
	}

	return surface
}

async function loadProviderRatePlansSurface(input: {
	providerId: string
	checkIn: string
	checkOut: string
	timing?: ServerTimingRecorder
}): Promise<ProviderRatePlansSurface> {
	const { providerId, checkIn, checkOut, timing } = input

	const rows = (await measured(timing, "ratePlansBase", () =>
		listRatePlansByProvider(providerId)
	)) as BaseRatePlanRow[]
	const requiredCategories = [...REQUIRED_POLICY_CATEGORIES]
	const expectedInventoryDays = countNights(checkIn, checkOut)
	const ratePlanIds = rows.map((row) => String(row.ratePlanId)).filter(Boolean)
	const variantIds = [...new Set(rows.map((row) => String(row.variantId)).filter(Boolean))]

	const [pricingSummaries, inventorySummaries] = await Promise.all([
		measured(timing, "pricing", () =>
			ratePlanIds.length
				? ratePlanPricingReadRepository.listRatePlanPricingSummaries(ratePlanIds)
				: Promise.resolve([])
		),
		measured(timing, "inventory", () =>
			variantIds.length
				? db
						.select({
							variantId: EffectiveAvailability.variantId,
							coverageDays: count(),
							availableDays: sql<number>`sum(case when ${EffectiveAvailability.availableUnits} > 0 then 1 else 0 end)`,
							totalUnits: sql<number>`sum(${EffectiveAvailability.totalUnits})`,
						})
						.from(EffectiveAvailability)
						.where(
							and(
								inArray(EffectiveAvailability.variantId, variantIds),
								gte(EffectiveAvailability.date, checkIn),
								lt(EffectiveAvailability.date, checkOut)
							)
						)
						.groupBy(EffectiveAvailability.variantId)
				: Promise.resolve([])
		),
	])

	const pricingByRatePlan = new Map(pricingSummaries.map((row) => [row.ratePlanId, row]))
	const inventoryByVariant = new Map(inventorySummaries.map((row) => [String(row.variantId), row]))
	const ratePlans = rows.map((row): RatePlanListItem => {
		const pricingSummary = pricingByRatePlan.get(String(row.ratePlanId)) ?? null
		const conditionsSummary =
			pricingSummary?.conditionsSummary ?? fallbackRatePlanConditionsSummary()
		const inventorySummary = inventoryByVariant.get(String(row.variantId)) ?? null
		const coverageDays = Number(inventorySummary?.coverageDays ?? 0)
		const availableDays = Number(inventorySummary?.availableDays ?? 0)
		const totalUnits = Number(inventorySummary?.totalUnits ?? 0)

		return {
			...row,
			pricingReadiness: {
				hasBasePrice: Boolean(pricingSummary),
				basePrice: pricingSummary?.basePrice ?? null,
				currency: pricingSummary?.currency ?? null,
				effectivePricingDays: Number(pricingSummary?.effectivePricingDays ?? 0),
			},
			inventoryReadiness: {
				isReady:
					coverageDays >= expectedInventoryDays &&
					availableDays >= expectedInventoryDays &&
					totalUnits > 0,
				coverageDays,
				availableDays,
				expectedDays: expectedInventoryDays,
			},
			policyCoverage: {
				totalCategories: conditionsSummary.totalCategories || requiredCategories.length,
				coveredCategories: conditionsSummary.coveredCategories,
				missingCategories: conditionsSummary.missingCategories,
				isComplete: conditionsSummary.conditionsComplete,
				policyCoverageUpdatedAt:
					conditionsSummary.policyCoverageUpdatedAt instanceof Date
						? conditionsSummary.policyCoverageUpdatedAt.toISOString()
						: conditionsSummary.policyCoverageUpdatedAt,
			},
			policySummary: conditionsSummary.summary,
		}
	})

	return {
		providerId,
		checkIn,
		checkOut,
		ratePlans,
	}
}
