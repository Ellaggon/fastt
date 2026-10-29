import { z } from "zod"

const requirement = z.enum(["required", "optional", "not_applicable"])
export const documentCaptureSchema = z
	.object({
		version: z.literal(1),
		issuer: requirement,
		issuedAt: requirement,
		expiresAt: requirement,
		allowedSubjectTypes: z
			.array(z.enum(["provider", "legal_entity", "person", "resource", "third_party"]))
			.min(1)
			.max(5),
		issuerCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
		requiredScopes: z.array(z.enum(["product", "resource", "territory", "activity"])).max(4),
	})
	.strict()

export const documentDefinitionDraftSchema = z
	.object({
		key: z.string().regex(/^[a-z][a-z0-9_.]{2,100}$/),
		label: z.string().trim().min(3).max(120),
		description: z.string().trim().min(3).max(1000),
		family: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
		capture: documentCaptureSchema,
	})
	.strict()

export type DocumentCapture = z.infer<typeof documentCaptureSchema>

export function validateDocumentCapture(
	capture: DocumentCapture,
	input: {
		issuer?: string | null
		issuedAt?: Date | null
		expiresAt?: Date | null
		subjectType: string
		subjectReference?: string | null
		scopeTypes: string[]
	}
) {
	const contract = documentCaptureSchema.parse(capture)
	for (const key of ["issuer", "issuedAt", "expiresAt"] as const) {
		if (contract[key] === "required" && !input[key]) throw new Error(`document_${key}_required`)
		if (contract[key] === "not_applicable" && input[key])
			throw new Error(`document_${key}_not_applicable`)
	}
	if (
		!contract.allowedSubjectTypes.includes(
			input.subjectType as DocumentCapture["allowedSubjectTypes"][number]
		)
	)
		throw new Error("document_subject_not_allowed")
	if (["person", "resource", "third_party"].includes(input.subjectType) && !input.subjectReference)
		throw new Error("document_subject_required")
	if (contract.requiredScopes.some((scope) => !input.scopeTypes.includes(scope)))
		throw new Error("document_scope_required")
	if (input.issuedAt && input.expiresAt && input.issuedAt > input.expiresAt)
		throw new Error("document_invalid_dates")
}
