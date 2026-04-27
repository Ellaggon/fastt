import { z } from "zod"

export const providerVerificationSchema = z
	.object({
		status: z.enum(["pending", "approved", "rejected"], {
			error: "Status must be pending, approved, or rejected",
		}),
		reason: z.string().trim().min(2, "Reason must be at least 2 characters").optional(),
		reviewedBy: z.string().trim().min(2, "Reviewer name must be at least 2 characters").optional(),
		metadataJson: z.string().trim().optional(),
	})
	.superRefine((val, ctx) => {
		if (val.status === "rejected" && !val.reason) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Reason is required when status is rejected",
				path: ["reason"],
			})
		}
		if (!val.metadataJson) return
		try {
			JSON.parse(val.metadataJson)
		} catch {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Metadata must be valid JSON",
				path: ["metadataJson"],
			})
		}
	})

export type ProviderVerification = z.infer<typeof providerVerificationSchema>
