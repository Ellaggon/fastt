/**
 * Stage 3 deterministic reconciliation read model.
 *
 * ReconciliationMatch compares booking contract snapshots against persisted payment/settlement
 * evidence. It is not accounting reconciliation and must not mutate bookings or execute PSP flows.
 */
export const RECONCILIATION_MATCH_STATUSES = [
	"matched",
	"mismatch",
	"missing_payment",
	"missing_settlement",
	"currency_mismatch",
] as const
export const RECONCILIATION_REVIEW_STATUSES = ["unreviewed", "reviewed"] as const
export const RECONCILIATION_REVIEW_STATES = ["fresh", "stale", "superseded"] as const
export const RECONCILIATION_MISMATCH_REASONS = [
	"payment_amount_mismatch",
	"settlement_amount_mismatch",
	"duplicate_external_reference",
	"missing_capture_reference",
	"refund_without_matching_cancellation",
	"stale_review",
	"unmatched_payment_transaction",
	"unmatched_settlement_record",
] as const

export type ReconciliationMatchStatus = (typeof RECONCILIATION_MATCH_STATUSES)[number]
export type ReconciliationReviewStatus = (typeof RECONCILIATION_REVIEW_STATUSES)[number]
export type ReconciliationReviewState = (typeof RECONCILIATION_REVIEW_STATES)[number]
export type ReconciliationMismatchReason = (typeof RECONCILIATION_MISMATCH_REASONS)[number]

export type ReconciliationMatch = {
	id: string
	bookingId: string
	providerId: string
	contractAmount: number
	paymentAmount?: number | null
	settlementAmount?: number | null
	differenceAmount: number
	status: ReconciliationMatchStatus
	mismatchReasons?: ReconciliationMismatchReason[]
	basis: string
	reviewStatus?: ReconciliationReviewStatus | null
	reviewState?: ReconciliationReviewState | null
	comparisonFingerprint?: string | null
	reviewFingerprint?: string | null
	reviewedAt?: Date | null
	reviewedBy?: string | null
	reviewNote?: string | null
	createdAt: Date
	updatedAt: Date
}
