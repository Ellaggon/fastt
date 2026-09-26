import { z } from "zod"

export const commercialRatePlanIntentSchema = z.enum([
	"flexible",
	"non_refundable",
	"long_stay",
	"early_booking",
])

export const createCommercialRatePlanSchema = z.object({
	variantId: z.string().trim().min(1),
	name: z.string().trim().min(2).max(120),
	description: z.string().trim().max(500).optional(),
	intent: commercialRatePlanIntentSchema.default("flexible"),
	discountPercent: z.coerce.number().min(1).max(50).optional(),
	minAdvanceDays: z.coerce.number().int().min(1).max(365).optional(),
	currency: z.enum(["BOB", "USD"]),
	basePrice: z.coerce.number().positive().max(1_000_000),
	publicationMode: z.enum(["draft", "publish"]).default("draft"),
	isDefault: z.boolean().default(false),
})

export type CreateCommercialRatePlanInput = z.infer<typeof createCommercialRatePlanSchema>
