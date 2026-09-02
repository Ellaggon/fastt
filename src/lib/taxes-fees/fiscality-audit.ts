import { db, eq, TaxFeeAssignment, TaxFeeDefinition } from "@/shared/infrastructure/db/compat"
import { auditFiscalityConfiguration } from "@/modules/taxes-fees/public"
import type {
	TaxFeeAssignment as TaxFeeAssignmentDomain,
	TaxFeeDefinition as TaxFeeDefinitionDomain,
} from "@/modules/taxes-fees/public"

function definitionFromRow(row: typeof TaxFeeDefinition.$inferSelect): TaxFeeDefinitionDomain {
	if (!row.providerId) throw new Error("TAX_FEE_DEFINITION_OWNER_MISSING")
	return {
		id: String(row.id),
		providerId: String(row.providerId),
		code: String(row.code),
		name: String(row.name),
		kind: row.kind as TaxFeeDefinitionDomain["kind"],
		calculationType: row.calculationType as TaxFeeDefinitionDomain["calculationType"],
		value: Number(row.value),
		currency: row.currency == null ? null : String(row.currency),
		inclusionType: row.inclusionType as TaxFeeDefinitionDomain["inclusionType"],
		appliesPer: row.appliesPer as TaxFeeDefinitionDomain["appliesPer"],
		priority: Number(row.priority ?? 0),
		jurisdictionJson: row.jurisdictionJson ?? null,
		effectiveFrom: row.effectiveFrom ?? null,
		effectiveTo: row.effectiveTo ?? null,
		status: row.status as TaxFeeDefinitionDomain["status"],
		createdAt: row.createdAt ?? new Date(0),
		updatedAt: row.updatedAt ?? new Date(0),
	}
}

function assignmentFromRow(row: {
	id: unknown
	taxFeeDefinitionId: unknown
	scope: unknown
	scopeId: unknown
	channel: unknown
	status: unknown
	createdAt: Date | null
}): TaxFeeAssignmentDomain {
	return {
		id: String(row.id),
		taxFeeDefinitionId: String(row.taxFeeDefinitionId),
		scope: row.scope as TaxFeeAssignmentDomain["scope"],
		scopeId: row.scopeId == null ? null : String(row.scopeId),
		channel: row.channel == null ? null : String(row.channel),
		status: row.status as TaxFeeAssignmentDomain["status"],
		createdAt: row.createdAt ?? new Date(0),
	}
}

export async function getProviderFiscalityAudit(providerId: string) {
	const definitions = await db
		.select()
		.from(TaxFeeDefinition)
		.where(eq(TaxFeeDefinition.providerId, providerId))
	const definitionIds = definitions.map((definition) => String(definition.id))
	const assignments = definitionIds.length
		? await db
				.select({
					id: TaxFeeAssignment.id,
					taxFeeDefinitionId: TaxFeeAssignment.taxFeeDefinitionId,
					scope: TaxFeeAssignment.scope,
					scopeId: TaxFeeAssignment.scopeId,
					channel: TaxFeeAssignment.channel,
					status: TaxFeeAssignment.status,
					createdAt: TaxFeeAssignment.createdAt,
				})
				.from(TaxFeeAssignment)
				.innerJoin(TaxFeeDefinition, eq(TaxFeeAssignment.taxFeeDefinitionId, TaxFeeDefinition.id))
				.where(eq(TaxFeeDefinition.providerId, providerId))
		: []

	return auditFiscalityConfiguration({
		definitions: definitions.map(definitionFromRow),
		assignments: assignments.map(assignmentFromRow),
	})
}
