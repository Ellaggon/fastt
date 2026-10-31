import { createHash } from "node:crypto"
import { z } from "zod"

export const directDocumentUploadSchema = z
	.object({
		idempotencyKey: z.string().trim().min(1).max(200),
		fileName: z.string().trim().min(1).max(240),
		mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
		sizeBytes: z
			.number()
			.int()
			.positive()
			.max(12 * 1024 * 1024),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict()

export function documentSubmissionId(providerId: string, key: string) {
	return `upload_${createHash("sha256").update(`provider.document.submit:${providerId}:${key.trim()}`).digest("hex").slice(0, 48)}`
}
