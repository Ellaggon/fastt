/**
 * Stage 2 shadow compatibility only.
 *
 * This object is refund evidence visibility stored in FinancialShadowRecord. It is NOT refund
 * execution, NOT PSP success, and NOT a dispute or support workflow source of truth.
 */
export type LegacyRefundShadowStatus = "pending" | "recorded" | "duplicate" | "failed"

export type LegacyRefundShadow = {
	id: string
	bookingId: string
	idempotencyKey: string
	amount: number
	currency: string
	reason: string
	status: LegacyRefundShadowStatus
}

export type RefundRecordStatus = LegacyRefundShadowStatus
export type RefundRecord = LegacyRefundShadow
