import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "../../domain/tax-fee.types"

export interface TaxFeeResolutionRepositoryPort {
	listActiveAssignments(params: {
		scopeChain: Array<{ scope: TaxFeeScope; scopeId: string | null }>
		channels: Array<string | null>
	}): Promise<TaxFeeAssignment[]>
	listDefinitionsByIds(ids: string[]): Promise<TaxFeeDefinition[]>
	getProviderIdByProductId(productId: string): Promise<string | null>
}
