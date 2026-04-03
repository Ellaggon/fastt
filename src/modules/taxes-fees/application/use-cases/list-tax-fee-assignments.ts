import type { TaxFeeDefinition, TaxFeeScope, TaxFeeStatus } from "../../domain/tax-fee.types"
import type { TaxFeeQueryRepositoryPort } from "../ports/TaxFeeQueryRepositoryPort"

export type TaxFeeAssignmentView = {
	id: string
	scope: TaxFeeScope
	scopeId: string | null
	channel: string | null
	status: TaxFeeStatus
	definition: TaxFeeDefinition
}

export async function listTaxFeeAssignmentsByScope(
	deps: { repo: TaxFeeQueryRepositoryPort },
	params: { scope: TaxFeeScope; scopeId: string | null }
): Promise<{ assignments: TaxFeeAssignmentView[] }> {
	const assignments = await deps.repo.listAssignmentsByScope({
		scope: params.scope,
		scopeId: params.scopeId,
	})

	if (!assignments.length) return { assignments: [] }

	const definitionIds = Array.from(new Set(assignments.map((a) => a.taxFeeDefinitionId)))
	const definitions = await deps.repo.listDefinitionsByIds(definitionIds)
	const definitionById = new Map(definitions.map((d) => [d.id, d]))

	const views: TaxFeeAssignmentView[] = assignments
		.map((a) => {
			const def = definitionById.get(a.taxFeeDefinitionId)
			if (!def) return null
			return {
				id: a.id,
				scope: a.scope,
				scopeId: a.scopeId,
				channel: a.channel,
				status: a.status,
				definition: def,
			}
		})
		.filter((v): v is TaxFeeAssignmentView => v !== null)

	return { assignments: views }
}
