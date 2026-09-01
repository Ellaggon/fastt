/**
 * Stage 3 settlement evidence visibility.
 *
 * FinancialSettlementRecord is intentionally not named SettlementRecord to avoid colliding with
 * This record is settlement evidence visibility. It is not payout execution and not
 * accounting finality.
 */
export type FinancialSettlementRecordSource = "import" | "operator_entry"

export type FinancialSettlementRecord = {
	id: string
	/** Null until externally reported settlement evidence is matched to a reservation. */
	bookingId: string | null
	providerId: string
	settlementReference: string
	amount: number
	currency: string
	settlementDate: Date
	source: FinancialSettlementRecordSource
	matchedAt?: Date | null
	createdAt: Date
}
