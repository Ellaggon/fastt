import { z } from "zod"

export const providerProfileSchema = z.object({
	timezone: z.string().trim().min(1),
	defaultCurrency: z.string().trim().min(3).max(3),
	supportEmail: z.string().trim().email().optional(),
	supportPhone: z.string().trim().min(3).optional(),
})

export type ProviderProfileInput = z.infer<typeof providerProfileSchema>
