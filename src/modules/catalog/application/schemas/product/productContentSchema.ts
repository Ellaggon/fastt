import { z } from "zod"

export const productContentSchema = z.object({
	productId: z.string().trim().min(1),
	description: z.string().trim().optional(),
	highlightsJson: z.string().trim().min(1),
})

export type ProductContentInput = z.infer<typeof productContentSchema>
