import { z } from "zod"

export const productContentSchema = z.object({
	productId: z.string().trim().min(1),
	description: z.string().trim().optional(),
	highlightsJson: z.string().trim().min(1),
	rules: z.string().trim().optional(),
})

export type ProductContentInput = z.infer<typeof productContentSchema>
