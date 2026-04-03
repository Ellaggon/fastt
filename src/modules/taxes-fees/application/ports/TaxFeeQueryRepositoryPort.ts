import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "../../domain/tax-fee.types"

export interface TaxFeeQueryRepositoryPort {
	listDefinitionsByProvider(providerId: string): Promise<TaxFeeDefinition[]>
	listAssignmentsByScope(params: {
		scope: TaxFeeScope
		scopeId: string | null
	}): Promise<TaxFeeAssignment[]>
	listDefinitionsByIds(ids: string[]): Promise<TaxFeeDefinition[]>
}
