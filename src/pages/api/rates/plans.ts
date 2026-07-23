import type { APIRoute } from "astro"
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

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ratePlanPricingReadRepository } from "@/container"
import { REQUIRED_POLICY_CATEGORIES, resolvePolicyDateRange } from "@/modules/policies/public"
import { fallbackRatePlanConditionsSummary } from "@/lib/policies/ratePlanConditionState"
import { listRatePlansByProvider } from "@/modules/pricing/public"

function countNights(checkIn: string, checkOut: string): number {
	const start = new Date(`${checkIn}T00:00:00.000Z`)
	const end = new Date(`${checkOut}T00:00:00.000Z`)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1
	return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
}

export const GET: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	if (!user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Provider profile not found" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const rows = await listRatePlansByProvider(providerId)
	const requestUrl = url ?? new URL(request.url || "http://localhost:4321/api/rates/plans")
	const { checkIn, checkOut } = resolvePolicyDateRange(requestUrl)
	const requiredCategories = [...REQUIRED_POLICY_CATEGORIES]
	const expectedInventoryDays = countNights(checkIn, checkOut)
	const ratePlanIds = rows.map((row: any) => String(row?.ratePlanId ?? "")).filter(Boolean)
	const variantIds = [
		...new Set(rows.map((row: any) => String(row?.variantId ?? "")).filter(Boolean)),
	]
	const [pricingSummaries, inventorySummaries] = await Promise.all([
		ratePlanPricingReadRepository.listRatePlanPricingSummaries(ratePlanIds),
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
			: Promise.resolve([]),
	])
	const pricingByRatePlan = new Map(pricingSummaries.map((row) => [row.ratePlanId, row]))
	const inventoryByVariant = new Map(inventorySummaries.map((row) => [String(row.variantId), row]))

	const rowsWithPolicySummary = rows.map((row: any) => {
		const ratePlanId = String(row?.ratePlanId ?? "")
		const variantId = String(row?.variantId ?? "")
		const pricingSummary = pricingByRatePlan.get(ratePlanId) ?? null
		const conditionsSummary =
			pricingSummary?.conditionsSummary ?? fallbackRatePlanConditionsSummary()
		const inventorySummary = inventoryByVariant.get(variantId) ?? null
		const inventoryCoverageDays = Number(inventorySummary?.coverageDays ?? 0)
		const inventoryAvailableDays = Number(inventorySummary?.availableDays ?? 0)
		const inventoryTotalUnits = Number(inventorySummary?.totalUnits ?? 0)
		const pricingReadiness = {
			hasBasePrice: Boolean(pricingSummary),
			basePrice: pricingSummary?.basePrice ?? null,
			currency: pricingSummary?.currency ?? null,
			effectivePricingDays: Number(pricingSummary?.effectivePricingDays ?? 0),
		}
		const inventoryReadiness = {
			isReady:
				inventoryCoverageDays >= expectedInventoryDays &&
				inventoryAvailableDays >= expectedInventoryDays &&
				inventoryTotalUnits > 0,
			coverageDays: inventoryCoverageDays,
			availableDays: inventoryAvailableDays,
			expectedDays: expectedInventoryDays,
		}
		return {
			...row,
			pricingReadiness,
			inventoryReadiness,
			policyCoverage: {
				totalCategories: conditionsSummary.totalCategories || requiredCategories.length,
				coveredCategories: conditionsSummary.coveredCategories,
				missingCategories: conditionsSummary.missingCategories,
				isComplete: conditionsSummary.conditionsComplete,
				policyCoverageUpdatedAt: conditionsSummary.policyCoverageUpdatedAt,
			},
			policySummary: conditionsSummary.summary,
		}
	})

	return new Response(JSON.stringify({ ratePlans: rowsWithPolicySummary }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
