/**
 * Stage 3 settlement evidence visibility.
 *
 * FinancialSettlementRecord is intentionally not named SettlementRecord to avoid colliding with
 * LegacySettlementShadow. It is not payout execution and not accounting finality.
 */
export type FinancialSettlementRecordSource =
	| "import"
	| "operator_entry"
	| "financial_shadow_bridge"

export type FinancialSettlementRecord = {
	id: string
	bookingId: string
	providerId: string
	settlementReference: string
	amount: number
	currency: string
	settlementDate: Date
	source: FinancialSettlementRecordSource
	matchedAt?: Date | null
	createdAt: Date
}
