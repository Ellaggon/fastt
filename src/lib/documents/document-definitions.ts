import {
	db,
	eq,
	and,
	desc,
	DocumentDefinition,
	DocumentDefinitionVersion,
} from "@/shared/infrastructure/db/compat"
import {
	documentDefinitionDraftSchema,
	documentCaptureSchema,
} from "@/shared/domain/document-definition"

/** Authorization belongs to the calling internal command, never to the provider form. */
export async function createDocumentDefinitionDraft(input: unknown) {
	const value = documentDefinitionDraftSchema.parse(input)
	return db.transaction(async (tx) => {
		await tx
			.insert(DocumentDefinition)
			.values({ id: crypto.randomUUID(), key: value.key })
			.onConflictDoNothing()
		const [definition] = await tx
			.select()
			.from(DocumentDefinition)
			.where(eq(DocumentDefinition.key, value.key))
			.for("update")
		if (!definition) throw new Error("document_definition_missing")
		const [previous] = await tx
			.select({ version: DocumentDefinitionVersion.version })
			.from(DocumentDefinitionVersion)
			.where(eq(DocumentDefinitionVersion.definitionId, definition.id))
			.orderBy(desc(DocumentDefinitionVersion.version))
			.limit(1)
		const [draft] = await tx
			.insert(DocumentDefinitionVersion)
			.values({
				id: crypto.randomUUID(),
				definitionId: definition.id,
				version: (previous?.version ?? 0) + 1,
				label: value.label,
				description: value.description,
				family: value.family,
				captureJson: value.capture,
			})
			.returning()
		return draft
	})
}

export async function readPublishedDocumentDefinition(id: string) {
	const [row] = await db
		.select()
		.from(DocumentDefinitionVersion)
		.where(
			and(eq(DocumentDefinitionVersion.id, id), eq(DocumentDefinitionVersion.status, "published"))
		)
	if (!row) throw Object.assign(new Error("document_definition_not_published"), { status: 422 })
	return { ...row, capture: documentCaptureSchema.parse(row.captureJson) }
}

export async function listPublishedDocumentDefinitions() {
	return db
		.select({
			id: DocumentDefinitionVersion.id,
			label: DocumentDefinitionVersion.label,
			family: DocumentDefinitionVersion.family,
			capture: DocumentDefinitionVersion.captureJson,
		})
		.from(DocumentDefinitionVersion)
		.where(eq(DocumentDefinitionVersion.status, "published"))
		.orderBy(DocumentDefinitionVersion.label)
}

export async function transitionDocumentDefinition(id: string, action: "publish" | "retire") {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(DocumentDefinitionVersion)
			.where(eq(DocumentDefinitionVersion.id, id))
			.for("update")
		if (!row || row.status !== (action === "publish" ? "draft" : "published"))
			throw new Error("document_definition_state_conflict")
		documentCaptureSchema.parse(row.captureJson)
		const [updated] = await tx
			.update(DocumentDefinitionVersion)
			.set({ status: action === "publish" ? "published" : "retired" })
			.where(eq(DocumentDefinitionVersion.id, id))
			.returning()
		return updated
	})
}
