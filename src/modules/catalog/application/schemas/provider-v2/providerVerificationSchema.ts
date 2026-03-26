import { z } from "zod"

export const providerVerificationSchema = z
	.object({
		status: z.enum(["pending", "approved", "rejected"]),
		reason: z.string().trim().min(2).optional(),
		reviewedBy: z.string().trim().min(2).optional(),
		metadataJson: z.string().trim().optional(),
	})
	.superRefine((val, ctx) => {
		if (!val.metadataJson) return
		try {
			JSON.parse(val.metadataJson)
		} catch {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "metadataJson must be valid JSON",
				path: ["metadataJson"],
			})
		}
	})

export type ProviderVerificationInput = z.infer<typeof providerVerificationSchema>
