import { z } from "zod"

export const setBaseRateSchema = z.object({
	variantId: z.string().trim().min(1),
	currency: z.string().trim().min(1),
	basePrice: z.number().min(0),
})
