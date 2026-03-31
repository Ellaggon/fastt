import { z } from "zod"

export const registerProviderSchema = z.object({
	companyName: z.string().trim().min(2),
	legalName: z.string().trim().min(2),
	displayName: z.string().trim().min(2),
	contactName: z.string().trim().min(2).optional(),
	contactEmail: z.string().trim().email().optional(),
	phone: z.string().trim().min(3).optional(),
	type: z.string().trim().min(2).optional(),
})

export type RegisterProviderInput = z.infer<typeof registerProviderSchema>
