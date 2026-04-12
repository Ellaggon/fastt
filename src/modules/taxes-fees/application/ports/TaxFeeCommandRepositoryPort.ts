import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "../../domain/tax-fee.types"

export interface TaxFeeCommandRepositoryPort {
	createDefinition(params: Omit<TaxFeeDefinition, "createdAt" | "updatedAt">): Promise<void>
	updateDefinition(params: Omit<TaxFeeDefinition, "createdAt" | "updatedAt">): Promise<void>
	createAssignment(params: Omit<TaxFeeAssignment, "createdAt">): Promise<void>
	getDefinitionById(id: string): Promise<TaxFeeDefinition | null>
	findActiveDefinitionByCodeProvider(params: {
		code: string
		providerId: string | null
	}): Promise<TaxFeeDefinition | null>
	findActiveAssignment(params: {
		definitionId: string
		scope: TaxFeeScope
		scopeId: string | null
		channel: string | null
	}): Promise<TaxFeeAssignment | null>
	findActiveAssignmentByCodeScope(params: {
		code: string
		scope: TaxFeeScope
		scopeId: string | null
	}): Promise<TaxFeeAssignment | null>
}
