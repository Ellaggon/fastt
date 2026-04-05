import { z } from "zod"

export const productBaseSchema = z.object({
	name: z.string().trim().min(1),
	productType: z.string().trim().min(1),
	providerId: z.string().trim().optional(),
	destinationId: z.string().trim().min(1),
})

export type ProductBaseInput = z.infer<typeof productBaseSchema>
