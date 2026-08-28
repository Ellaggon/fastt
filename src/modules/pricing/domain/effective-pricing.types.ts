import type { Occupancy } from "@/shared/domain/occupancy"

export type PricingBreakdown = {
	base: number
	occupancyAdjustment: number
	rules: number
	final: number
}

export type EffectivePricingComputationInput = {
	variantId: string
	ratePlanId: string
	date: string
	occupancy: Occupancy
	fallbackCurrency?: string
}
