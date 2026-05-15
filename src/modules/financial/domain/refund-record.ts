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

/** @deprecated Use PaymentTransaction(type: "refund") for Stage 3 refund evidence identity. */
export type RefundRecordStatus = LegacyRefundShadowStatus
/** @deprecated Compatibility alias only. Do not use as refund execution truth. */
export type RefundRecord = LegacyRefundShadow
