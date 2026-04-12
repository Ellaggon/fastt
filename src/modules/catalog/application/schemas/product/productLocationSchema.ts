import { z } from "zod"

export const productLocationSchema = z.object({
	productId: z.string().trim().min(1),
	address: z.string().trim().optional(),
	lat: z.coerce.number().refine(Number.isFinite, { message: "lat must be a finite number" }),
	lng: z.coerce.number().refine(Number.isFinite, { message: "lng must be a finite number" }),
})

export type ProductLocationInput = z.infer<typeof productLocationSchema>
