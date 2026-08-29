import type { Occupancy } from "@/shared/domain/occupancy"
import { computeEffectivePricing } from "./compute-effective-pricing"

export const SHADOW_OCCUPANCIES: Occupancy[] = [
	{ adults: 1, children: 0, infants: 0 },
	{ adults: 2, children: 0, infants: 0 },
	{ adults: 2, children: 1, infants: 0 },
	{ adults: 3, children: 0, infants: 0 },
]

export async function recomputeEffectivePricingRange(
	deps: {
		getBaseFromPolicy: (params: {
			ratePlanId: string
			date: string
			occupancyKey: string
		}) => Promise<{
			baseAmount: number
			currency: string
		} | null>
		getActiveOccupancyPolicy: (params: { ratePlanId: string; date: string }) => Promise<{
			baseAdults: number
			baseChildren: number
			extraAdultMode: "fixed" | "percentage"
			extraAdultValue: number
			childMode: "fixed" | "percentage"
			childValue: number
			currency: string
		} | null>
		getPreviewRules: (ratePlanId: string) => Promise<
			Array<{
				id: string
				type: string
				value: number
				occupancyKey?: string | null
				priority: number
				dateRangeJson?: { from?: string | null; to?: string | null } | null
				dayOfWeekJson?: number[] | null
				createdAt: Date
			}>
		>
		getFallbackCurrency?: (ratePlanId: string) => Promise<string>
		saveEffectivePricing: (params: {
			id: string
			variantId: string
			ratePlanId: string
			date: string
			occupancyKey: string
			baseComponent: number
			occupancyAdjustment: number
			ruleAdjustment: number
			finalBasePrice: number
			currency: string
			computedAt: Date
			sourceVersion: string
		}) => Promise<void>
	},
	input: {
		variantId: string
		ratePlanId: string
		dates: string[]
		occupancies?: Occupancy[]
		fallbackCurrency?: string
		maxConcurrency?: number
	}
): Promise<{ rows: number; occupancyKeys: string[] }> {
	const rules = await deps.getPreviewRules(input.ratePlanId)
	const occupancies =
		input.occupancies && input.occupancies.length > 0 ? input.occupancies : SHADOW_OCCUPANCIES
	const work = input.dates.flatMap((date) => occupancies.map((occupancy) => ({ date, occupancy })))
	const concurrency = Math.max(1, Math.min(Math.trunc(input.maxConcurrency ?? 4), 8))
	const occupancyKeys = new Set<string>()
	let cursor = 0
	const workers = Array.from({ length: Math.min(concurrency, work.length || 1) }, async () => {
		while (true) {
			const index = cursor++
			const item = work[index]
			if (!item) return
			const result = await computeEffectivePricing(
				{
					getBaseFromPolicy: deps.getBaseFromPolicy,
					getActiveOccupancyPolicy: deps.getActiveOccupancyPolicy,
					getPreviewRules: async () => rules,
					getFallbackCurrency: deps.getFallbackCurrency,
				},
				{
					variantId: input.variantId,
					ratePlanId: input.ratePlanId,
					date: item.date,
					occupancy: item.occupancy,
					fallbackCurrency: input.fallbackCurrency,
				}
			)
			const occupancyKey = result.occupancyKey
			occupancyKeys.add(occupancyKey)
			await deps.saveEffectivePricing({
				id: `ep_${input.variantId}_${input.ratePlanId}_${item.date}_${occupancyKey}`,
				variantId: input.variantId,
				ratePlanId: input.ratePlanId,
				date: item.date,
				occupancyKey,
				baseComponent: result.breakdown.base,
				occupancyAdjustment: result.breakdown.occupancyAdjustment,
				ruleAdjustment: result.breakdown.rules,
				finalBasePrice: result.breakdown.final,
				currency: result.currency,
				computedAt: new Date(),
				sourceVersion: result.sourceVersion,
			})
		}
	})
	await Promise.all(workers)
	return { rows: work.length, occupancyKeys: [...occupancyKeys].sort((a, b) => a.localeCompare(b)) }
}
