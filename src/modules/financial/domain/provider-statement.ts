/**
 * Stage 4 provider statement read artifact.
 *
 * ProviderStatement aggregates visibility for operations. It is not an invoice, ledger, or
 * accounting statement.
 */
export const PROVIDER_STATEMENT_STATUSES = ["pending", "visible", "recorded", "unknown"] as const

export type ProviderStatementStatus = (typeof PROVIDER_STATEMENT_STATUSES)[number]

export type ProviderStatement = {
	id: string
	providerId: string
	statementReference?: string | null
	periodStart?: Date | null
	periodEnd?: Date | null
	status: ProviderStatementStatus
	totalGrossAmount: number
	totalCommissionAmount: number
	totalTaxAmount: number
	totalNetPayable: number
	currency: string
	basis: "provider_payable_snapshot_aggregation"
	createdAt: Date
	updatedAt: Date
}
