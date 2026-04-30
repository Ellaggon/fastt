import type { Occupancy } from "@/shared/domain/occupancy"

export type PricingBreakdownV2 = {
	base: number
	occupancyAdjustment: number
	rules: number
	final: number
}

export type EffectivePricingV2ComputationInput = {
	variantId: string
	ratePlanId: string
	date: string
	occupancy: Occupancy
}
