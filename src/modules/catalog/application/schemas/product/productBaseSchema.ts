import { z } from "zod"
import { normalizeProductTypeValue } from "@/lib/catalog/productVerticalRegistry"

export const productBaseSchema = z.object({
	name: z.string().trim().min(1),
	productType: z
		.string()
		.trim()
		.min(1)
		.refine((value) => normalizeProductTypeValue(value) !== null, {
			message: "Unsupported product type",
		}),
	providerId: z.string().trim().optional(),
	destinationId: z.string().trim().min(1),
})

export type ProductBaseInput = z.infer<typeof productBaseSchema>
