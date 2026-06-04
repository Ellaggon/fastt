export type RefundQuoteStatus = "quoted" | "requires_manual_review" | "expired" | "superseded"

export type RefundQuoteLine = {
	type: "base" | "tax" | "fee" | "adjustment"
	label: string
	basis: string
	amount: number
	refundPercent: number
	refundAmount: number
	currency: string
}

export type RefundQuotePolicySnapshot = {
	sourcePolicyId: string | null
	sourcePolicyVersion: number | null
	sourcePolicyPresetKey: string | null
	deadlineLocal: string | null
	refundBasis: string | null
	taxesFeesBasis: string | null
	payoutBasis: string | null
	hostPayoutPercent: number | null
	hostPayoutAmount: number | null
	hostCancellationFeeAmount: number
	rebookingCreditAmount: number
	appliedOverrideIds: string[]
}

export type RefundQuote = {
	id: string
	bookingId: string
	providerId: string
	status: RefundQuoteStatus
	reason: string
	currency: string
	grossAmount: number
	refundAmount: number
	nonRefundableAmount: number
	taxFeeRefundAmount: number
	payoutImpactAmount: number
	paymentDueLocal: string | null
	cancellationDeadlineLocal: string | null
	refundPercent: number | null
	policySnapshot: RefundQuotePolicySnapshot
	lines: RefundQuoteLine[]
	calculationSnapshotJson: unknown
	idempotencyKey: string
	quotedAt: Date
	expiresAt: Date | null
	createdBy: string | null
}
