export type FinancialWorkspaceState = {
	operationsItems: any[]
	workflowItems: any[]
	reviewEvents: any[]
	persistedReferences: any[]
	persistedRefundHandoffs: any[]
	reconciliationItems: any[]
	providerFinanceItems: any[]
	duplicateExternalReferences: any[]
	unmatchedFinancialEvidence: {
		paymentTransactions: any[]
		settlementRecords: any[]
	}
	combinedItems: any[]
	selectedItem: any | null
}

export function createFinancialWorkspaceState(): FinancialWorkspaceState {
	return {
		operationsItems: [],
		workflowItems: [],
		reviewEvents: [],
		persistedReferences: [],
		persistedRefundHandoffs: [],
		reconciliationItems: [],
		providerFinanceItems: [],
		duplicateExternalReferences: [],
		unmatchedFinancialEvidence: { paymentTransactions: [], settlementRecords: [] },
		combinedItems: [],
		selectedItem: null,
	}
}

export function resetFinancialWorkspaceState(state: FinancialWorkspaceState): void {
	Object.assign(state, createFinancialWorkspaceState())
}
