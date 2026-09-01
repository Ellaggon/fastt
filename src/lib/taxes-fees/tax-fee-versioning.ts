import {
	db,
	desc,
	eq,
	FiscalActivityEvent,
	sql,
	TaxFeeDefinition,
	TaxFeeDefinitionDraft,
	TaxFeeDefinitionVersion,
} from "@/shared/infrastructure/db/compat"
import { snapshotForProviderAudit } from "@/lib/provider-audit"
import { createTaxFeeDefinitionSnapshot } from "@/lib/taxes-fees/tax-fee-definition-snapshot"

export type TaxFeePublicationState = "published" | "scheduled"

export type TaxFeeDefinitionPublicationPatch = {
	code: string
	name: string
	kind: "tax" | "fee"
	calculationType: "percentage" | "fixed"
	value: number
	currency: string | null
	inclusionType: "included" | "excluded"
	appliesPer: "stay" | "night" | "guest" | "guest_night"
	priority: number
	jurisdictionJson: unknown | null
	effectiveFrom: Date | null
	effectiveTo: Date | null
}

export class TaxFeeDefinitionPublicationConflictError extends Error {
	readonly code = "TAX_FEE_DEFINITION_PUBLICATION_CONFLICT"

	constructor(
		message = "La definición cambió mientras la revisabas. Actualiza y vuelve a publicar."
	) {
		super(message)
		this.name = "TaxFeeDefinitionPublicationConflictError"
	}
}

type TaxFeePublicationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The only write path that turns a staged definition into a sellable version.
 * It locks the definition, validates the editor's baseline, optionally stages
 * the reviewed fields, writes the immutable snapshot and advances the pointer
 * in one database transaction.
 */
type PublishTaxFeeDefinitionInput = {
	definitionId: string
	actorUserId: string
	/** Required for provider-facing publication; system certification may omit it. */
	providerId?: string
	publicationState: TaxFeePublicationState
	/** The operational lifecycle becomes visible in the same commit as the version pointer. */
	operationalStatus?: "active" | "archived"
	/** Optimistic-concurrency token captured when the editor opened the definition. */
	expectedCurrentVersionId: string | null
	/** Human-readable alternative for clients that only retain the version number. */
	expectedRevision: number
	/** Reviewed changes to release with this exact snapshot. */
	definitionPatch?: TaxFeeDefinitionPublicationPatch
}

function draftPatch(
	row: TaxFeeDefinitionPublicationPatch | typeof TaxFeeDefinitionDraft.$inferSelect
) {
	return {
		code: row.code,
		name: row.name,
		kind: row.kind as TaxFeeDefinitionPublicationPatch["kind"],
		calculationType: row.calculationType as TaxFeeDefinitionPublicationPatch["calculationType"],
		value: Number(row.value),
		currency: row.currency,
		inclusionType: row.inclusionType as TaxFeeDefinitionPublicationPatch["inclusionType"],
		appliesPer: row.appliesPer as TaxFeeDefinitionPublicationPatch["appliesPer"],
		priority: Number(row.priority),
		jurisdictionJson: row.jurisdictionJson,
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo,
	}
}

type SaveTaxFeeDefinitionDraftInput = {
	definitionId: string
	providerId: string
	actorUserId: string
	patch: TaxFeeDefinitionPublicationPatch
}

async function saveTaxFeeDefinitionDraftInTransaction(
	tx: TaxFeePublicationTransaction,
	input: SaveTaxFeeDefinitionDraftInput
) {
	await tx.execute(
		sql`SELECT "id" FROM "TaxFeeDefinition" WHERE "id" = ${input.definitionId} FOR UPDATE`
	)
	const definition = await tx
		.select()
		.from(TaxFeeDefinition)
		.where(eq(TaxFeeDefinition.id, input.definitionId))
		.then((rows) => rows[0] ?? null)
	if (!definition || definition.providerId !== input.providerId) throw new Error("Not found")
	const now = new Date()
	if (!definition.currentVersionId) {
		await tx
			.update(TaxFeeDefinition)
			.set({ ...input.patch, status: "archived", editingState: "draft", updatedAt: now })
			.where(eq(TaxFeeDefinition.id, input.definitionId))
		return { id: input.definitionId, isolated: false }
	}
	await tx
		.insert(TaxFeeDefinitionDraft)
		.values({
			definitionId: input.definitionId,
			baseVersionId: definition.currentVersionId,
			...input.patch,
			updatedByUserId: input.actorUserId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: TaxFeeDefinitionDraft.definitionId,
			set: {
				baseVersionId: definition.currentVersionId,
				...input.patch,
				updatedByUserId: input.actorUserId,
				updatedAt: now,
			},
		})
	return { id: input.definitionId, isolated: true }
}

export async function saveTaxFeeDefinitionDraft(
	input: SaveTaxFeeDefinitionDraftInput,
	options?: { transaction?: TaxFeePublicationTransaction }
) {
	if (options?.transaction)
		return saveTaxFeeDefinitionDraftInTransaction(options.transaction, input)
	return db.transaction((tx) => saveTaxFeeDefinitionDraftInTransaction(tx, input))
}

async function publishTaxFeeDefinitionInTransaction(
	tx: TaxFeePublicationTransaction,
	input: PublishTaxFeeDefinitionInput
) {
	// Serialise publications for one definition. Without this lock two editors
	// can both derive the same next version number from the same history.
	await tx.execute(sql`
			SELECT "id"
			FROM "TaxFeeDefinition"
			WHERE "id" = ${input.definitionId}
			FOR UPDATE
		`)
	const [definition, pendingDraft, latest] = await Promise.all([
		tx
			.select()
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.id, input.definitionId))
			.then((rows) => rows[0] ?? null),
		tx
			.select()
			.from(TaxFeeDefinitionDraft)
			.where(eq(TaxFeeDefinitionDraft.definitionId, input.definitionId))
			.then((rows) => rows[0] ?? null),
		tx
			.select({ version: TaxFeeDefinitionVersion.version })
			.from(TaxFeeDefinitionVersion)
			.where(eq(TaxFeeDefinitionVersion.taxFeeDefinitionId, input.definitionId))
			.orderBy(desc(TaxFeeDefinitionVersion.version))
			.then((rows) => rows[0] ?? null),
	])
	if (!definition) throw new Error("Not found")
	if (input.providerId !== undefined && definition.providerId !== input.providerId) {
		throw new Error("Not found")
	}
	if (definition.currentVersionId !== input.expectedCurrentVersionId) {
		throw new TaxFeeDefinitionPublicationConflictError()
	}
	const currentRevision = Number(latest?.version ?? 0)
	if (currentRevision !== input.expectedRevision) {
		throw new TaxFeeDefinitionPublicationConflictError()
	}

	const now = new Date()
	const patch = input.definitionPatch ?? (pendingDraft ? draftPatch(pendingDraft) : undefined)
	const releasedDefinition = patch ? { ...definition, ...patch, updatedAt: now } : definition
	if (patch) {
		await tx
			.update(TaxFeeDefinition)
			.set({ ...patch, updatedAt: now })
			.where(eq(TaxFeeDefinition.id, input.definitionId))
	}
	const id = crypto.randomUUID()
	const version = currentRevision + 1
	const snapshot = createTaxFeeDefinitionSnapshot({
		code: releasedDefinition.code,
		name: releasedDefinition.name,
		kind: releasedDefinition.kind as "tax" | "fee",
		calculationType: releasedDefinition.calculationType as "percentage" | "fixed",
		value: Number(releasedDefinition.value),
		currency: releasedDefinition.currency,
		inclusionType: releasedDefinition.inclusionType as "included" | "excluded",
		appliesPer: releasedDefinition.appliesPer as "stay" | "night" | "guest" | "guest_night",
		priority: releasedDefinition.priority,
		jurisdiction: releasedDefinition.jurisdictionJson,
		effectiveFrom: releasedDefinition.effectiveFrom?.toISOString() ?? null,
		effectiveTo: releasedDefinition.effectiveTo?.toISOString() ?? null,
	})
	await tx.insert(TaxFeeDefinitionVersion).values({
		id,
		taxFeeDefinitionId: input.definitionId,
		version,
		publicationState: input.publicationState,
		snapshotJson: snapshot,
		createdByUserId: input.actorUserId,
		createdAt: now,
	})
	await tx
		.update(TaxFeeDefinition)
		.set({
			currentVersionId: id,
			editingState: "published",
			status: input.operationalStatus ?? "active",
			updatedAt: now,
		})
		.where(eq(TaxFeeDefinition.id, input.definitionId))
	if (pendingDraft) {
		await tx
			.delete(TaxFeeDefinitionDraft)
			.where(eq(TaxFeeDefinitionDraft.definitionId, input.definitionId))
	}
	if (!definition.providerId) throw new Error("A published tax definition requires a provider.")
	await tx.insert(FiscalActivityEvent).values({
		id: crypto.randomUUID(),
		providerId: definition.providerId,
		eventType:
			input.publicationState === "scheduled" ? "definition_scheduled" : "definition_published",
		definitionId: input.definitionId,
		definitionVersionId: id,
		actorUserId: input.actorUserId,
		correlationId: crypto.randomUUID(),
		result: "succeeded",
		riskLevel: "high",
		beforeJson: snapshotForProviderAudit(definition),
		afterJson: snapshotForProviderAudit(releasedDefinition),
		contextJson: { version, publicationState: input.publicationState },
		createdAt: now,
	})
	return { id, version, snapshot }
}

export async function publishTaxFeeDefinition(
	input: PublishTaxFeeDefinitionInput,
	options?: { transaction?: TaxFeePublicationTransaction }
) {
	if (options?.transaction) {
		return publishTaxFeeDefinitionInTransaction(options.transaction, input)
	}
	return db.transaction((tx) => publishTaxFeeDefinitionInTransaction(tx, input))
}
