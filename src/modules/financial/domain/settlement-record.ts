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

/** @deprecated Use FinancialSettlementRecord for Stage 3 settlement evidence identity. */
export type SettlementRecordStatus = LegacySettlementShadowStatus
/** @deprecated Compatibility alias only. Do not use as settlement or payable truth. */
export type SettlementRecord = LegacySettlementShadow
