import { z } from "zod"
import { documentCaptureSchema, validateDocumentCapture } from "@/shared/domain/document-definition"
import { definedUploadType } from "./definition-upload-type"

export const documentReuseSchema = z.object({
	providerId: z.string().min(1).max(200),
	documentId: z.string().min(1).max(200),
	definitionVersionId: z.string().uuid(),
	subjectType: z.enum(["person", "legal_entity", "provider"]),
	subjectReference: z.string().trim().min(1).max(200),
	issuer: z.string().trim().min(1).max(200),
	issuedAt: z.coerce.date(),
	expiresAt: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()),
	reason: z.string().trim().min(10).max(500),
})

export function validateDocumentReuse(
	input: z.infer<typeof documentReuseSchema>,
	source: {
		providerId: string
		status: string
		type: string
		fileUrl: string | null
		expiresAt: Date | null
	},
	definition: { key: string; family: string; status: string; captureJson: unknown },
	now = new Date()
) {
	if (source.providerId !== input.providerId || source.status !== "verified" || !source.fileUrl)
		throw new Error("verified_document_required")
	if (source.expiresAt && source.expiresAt <= now) throw new Error("document_expired")
	if (source.expiresAt && (!input.expiresAt || input.expiresAt > source.expiresAt))
		throw new Error("document_expiry_cannot_be_extended")
	if (definition.status !== "published") throw new Error("document_definition_not_published")
	if (!definition.key.startsWith("bo.holder.") || definedUploadType(definition) !== source.type)
		throw new Error("document_family_mismatch")
	const capture = documentCaptureSchema.parse(definition.captureJson)
	if (capture.requiredScopes.length) throw new Error("document_reuse_scope_review_required")
	if (input.subjectType !== "person" && input.subjectReference !== input.providerId)
		throw new Error("document_subject_mismatch")
	if (input.issuedAt > now || (input.expiresAt && input.expiresAt <= now))
		throw new Error("document_invalid_dates")
	validateDocumentCapture(capture, { ...input, scopeTypes: [] })
	return input
}
