/**
 * Stage 2 shadow compatibility only.
 *
 * This object is settlement evidence visibility stored in FinancialShadowRecord. It is NOT a
 * settlement execution record, NOT provider payout state, and NOT accounting reconciliation.
 */
export type LegacySettlementShadowStatus = "pending" | "recorded" | "duplicate" | "failed"

export type LegacySettlementShadow = {
	id: string
	bookingId: string
	providerId: string
	idempotencyKey: string
	grossAmount: number
	netAmount: number
	commissionAmount: number
	currency: string
	status: LegacySettlementShadowStatus
}

export type SettlementRecordStatus = LegacySettlementShadowStatus
export type SettlementRecord = LegacySettlementShadow
