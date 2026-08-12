import {
	db,
	desc,
	eq,
	TaxFeeDefinition,
	TaxFeeDefinitionVersion,
} from "@/shared/infrastructure/db/compat"

export type TaxFeePublicationState = "published" | "scheduled"

/** Records the exact commercial rule released for future audit and comparison. */
export async function publishTaxFeeDefinitionVersion(input: {
	definitionId: string
	actorUserId: string
	publicationState: TaxFeePublicationState
}) {
	return db.transaction(async (tx) => {
		const [definition, latest] = await Promise.all([
			tx
				.select()
				.from(TaxFeeDefinition)
				.where(eq(TaxFeeDefinition.id, input.definitionId))
				.then((rows) => rows[0] ?? null),
			tx
				.select({ version: TaxFeeDefinitionVersion.version })
				.from(TaxFeeDefinitionVersion)
				.where(eq(TaxFeeDefinitionVersion.taxFeeDefinitionId, input.definitionId))
				.orderBy(desc(TaxFeeDefinitionVersion.version))
				.then((rows) => rows[0] ?? null),
		])
		if (!definition) throw new Error("Not found")
		const id = crypto.randomUUID()
		const version = Number(latest?.version ?? 0) + 1
		const snapshot = {
			code: definition.code,
			name: definition.name,
			kind: definition.kind,
			calculationType: definition.calculationType,
			value: Number(definition.value),
			currency: definition.currency,
			inclusionType: definition.inclusionType,
			appliesPer: definition.appliesPer,
			priority: definition.priority,
			jurisdiction: definition.jurisdictionJson,
			effectiveFrom: definition.effectiveFrom?.toISOString() ?? null,
			effectiveTo: definition.effectiveTo?.toISOString() ?? null,
		}
		await tx.insert(TaxFeeDefinitionVersion).values({
			id,
			taxFeeDefinitionId: input.definitionId,
			version,
			publicationState: input.publicationState,
			snapshotJson: snapshot,
			createdByUserId: input.actorUserId,
			createdAt: new Date(),
		})
		await tx
			.update(TaxFeeDefinition)
			.set({ currentVersionId: id, editingState: "published", updatedAt: new Date() })
			.where(eq(TaxFeeDefinition.id, input.definitionId))
		return { id, version, snapshot }
	})
}
