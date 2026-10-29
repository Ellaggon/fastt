import { z } from "zod"

export const documentAcceptanceSchema = z
	.object({
		version: z.literal(1),
		alternatives: z
			.array(
				z
					.object({
						id: z.string().min(1).max(100),
						allOf: z
							.array(z.object({ definitionVersionId: z.string().min(1).max(200) }).strict())
							.min(1)
							.max(20)
							.refine(
								(items) =>
									new Set(items.map((item) => item.definitionVersionId)).size === items.length
							),
					})
					.strict()
			)
			.min(1)
			.max(20)
			.refine((items) => new Set(items.map((item) => item.id)).size === items.length),
	})
	.strict()

/** Each alternative is a complete package; packages never borrow another subject's evidence. */
export type DocumentAcceptance = {
	version: 1
	alternatives: Array<{
		id: string
		allOf: Array<{ definitionVersionId: string }>
	}>
}

export type AcceptableDocument = {
	id: string
	definitionVersionId: string | null
	subjectId: string
}

export function evaluateDocumentAcceptance(
	acceptance: DocumentAcceptance,
	subjectIds: readonly string[],
	documents: readonly AcceptableDocument[]
) {
	if (!documentAcceptanceSchema.safeParse(acceptance).success)
		throw new Error("invalid_document_acceptance")
	if (subjectIds.some((id) => !id.trim())) throw new Error("invalid_document_subject")
	const subjects = [...new Set(subjectIds)]
	const results = subjects.map((subjectId) => {
		const candidates = documents.filter((document) => document.subjectId === subjectId)
		const alternatives = acceptance.alternatives.map((alternative) => {
			const evidenceIds: string[] = []
			const missing: string[] = []
			for (const part of alternative.allOf) {
				const match = candidates.find(
					(document) => document.definitionVersionId === part.definitionVersionId
				)
				if (match) evidenceIds.push(match.id)
				else missing.push(part.definitionVersionId)
			}
			return { alternativeId: alternative.id, evidenceIds: [...new Set(evidenceIds)], missing }
		})
		return {
			subjectId,
			satisfiedBy: alternatives.find((item) => !item.missing.length) ?? null,
			alternatives,
		}
	})
	return {
		satisfied: results.length > 0 && results.every((item) => item.satisfiedBy !== null),
		subjects: results,
	}
}
