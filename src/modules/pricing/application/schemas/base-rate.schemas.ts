import { z } from "zod"

export const setRatePlanPricingBaselineSchema = z.object({
	variantId: z.string().trim().min(1),
	currency: z.string().trim().min(1),
	basePrice: z.number().min(0),
})

/**
 * @deprecated Use setRatePlanPricingBaselineSchema.
 */
export const setBaseRateSchema = setRatePlanPricingBaselineSchema
