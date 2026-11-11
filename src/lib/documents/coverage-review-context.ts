import {
	db,
	and,
	eq,
	ProviderDocument,
	DocumentDefinitionVersion,
	DocumentDefinition,
} from "@/shared/infrastructure/db/compat"
import { coverageReviewKind } from "./coverage-review"

export async function readCoverageReviewContext(providerId: string, documentId: string) {
	const [row] = await db
		.select({ key: DocumentDefinition.key })
		.from(ProviderDocument)
		.innerJoin(
			DocumentDefinitionVersion,
			eq(DocumentDefinitionVersion.id, ProviderDocument.definitionVersionId)
		)
		.innerJoin(
			DocumentDefinition,
			eq(DocumentDefinition.id, DocumentDefinitionVersion.definitionId)
		)
		.where(and(eq(ProviderDocument.id, documentId), eq(ProviderDocument.providerId, providerId)))
	return row ? { key: row.key, kind: coverageReviewKind(row.key) } : null
}
