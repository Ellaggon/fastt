/**
 * Stage 3 import/visibility attempt record.
 *
 * PaymentAttempt records evidence-ingestion attempts only. It is not retry automation and must not
 * execute PSP calls.
 */
export const PAYMENT_ATTEMPT_TYPES = ["import", "manual_record", "duplicate_detection"] as const
export const PAYMENT_ATTEMPT_STATUSES = ["visible", "recorded", "failed", "duplicate"] as const

export type PaymentAttemptType = (typeof PAYMENT_ATTEMPT_TYPES)[number]
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number]

export type PaymentAttempt = {
	id: string
	paymentTransactionId: string
	attemptType: PaymentAttemptType
	status: PaymentAttemptStatus
	failureReason?: string | null
	externalReference?: string | null
	createdAt: Date
}
