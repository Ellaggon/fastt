import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"
import type { Occupancy } from "@/shared/domain/occupancy"
import { computeEffectivePricingV2 } from "./compute-effective-pricing-v2"

export const SHADOW_OCCUPANCIES: Occupancy[] = [
	{ adults: 1, children: 0, infants: 0 },
	{ adults: 2, children: 0, infants: 0 },
	{ adults: 2, children: 1, infants: 0 },
	{ adults: 3, children: 0, infants: 0 },
]

export async function recomputeEffectivePricingV2Range(
	deps: {
		getBaseFromPolicy: (params: {
			ratePlanId: string
			date: string
			occupancyKey: string
		}) => Promise<{
			baseAmount: number
			baseCurrency: string
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
		saveEffectivePricingV2: (params: {
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
	}
): Promise<{ rows: number; occupancyKeys: string[] }> {
	let rows = 0
	const occupancyKeys = new Set<string>()
	const occupancies =
		input.occupancies && input.occupancies.length > 0 ? input.occupancies : SHADOW_OCCUPANCIES
	for (const date of input.dates) {
		for (const occupancy of occupancies) {
			const result = await computeEffectivePricingV2(
				{
					getBaseFromPolicy: deps.getBaseFromPolicy,
					getActiveOccupancyPolicy: deps.getActiveOccupancyPolicy,
					getPreviewRules: deps.getPreviewRules,
				},
				{
					variantId: input.variantId,
					ratePlanId: input.ratePlanId,
					date,
					occupancy,
				}
			)
			const occupancyKey =
				result.occupancyKey || buildOccupancyKey({ ...occupancy, infants: occupancy.infants ?? 0 })
			occupancyKeys.add(occupancyKey)
			await deps.saveEffectivePricingV2({
				id: `epv2_${input.variantId}_${input.ratePlanId}_${date}_${occupancyKey}`,
				variantId: input.variantId,
				ratePlanId: input.ratePlanId,
				date,
				occupancyKey,
				baseComponent: result.breakdown.base,
				occupancyAdjustment: result.breakdown.occupancyAdjustment,
				ruleAdjustment: result.breakdown.rules,
				finalBasePrice: result.breakdown.final,
				currency: result.currency,
				computedAt: new Date(),
				sourceVersion: result.sourceVersion,
			})
			rows += 1
		}
	}
	return { rows, occupancyKeys: [...occupancyKeys].sort((a, b) => a.localeCompare(b)) }
}
