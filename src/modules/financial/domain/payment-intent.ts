/**
 * Stage 2 shadow compatibility only.
 *
 * This object is persisted inside FinancialShadowRecord as operational evidence produced by
 * booking confirmation. It is NOT a PSP transaction, NOT a payment lifecycle model, and NOT a
 * source of truth for money movement. Stage 3 must introduce a separate transaction model rather
 * than promoting this shadow payload.
 */
export type LegacyPaymentIntentShadowStatus = "pending" | "recorded" | "duplicate" | "failed"

export type LegacyPaymentIntentShadow = {
	id: string
	bookingId: string
	amount: number
	currency: string
	status: LegacyPaymentIntentShadowStatus
	source: string
	idempotencyKey: string
	metadata?: Record<string, unknown>
}

/** @deprecated Use PaymentTransaction for Stage 3 PSP evidence identity. */
export type PaymentIntentStatus = LegacyPaymentIntentShadowStatus
/** @deprecated Compatibility alias only. Do not use as payment transaction truth. */
export type PaymentIntent = LegacyPaymentIntentShadow
