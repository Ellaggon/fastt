export type RefundLedgerStatus = "recorded" | "reversed" | "voided"

export type RefundLedger = {
	id: string
	refundQuoteId: string
	bookingId: string
	providerId: string
	status: RefundLedgerStatus
	currency: string
	refundAmount: number
	payoutImpactAmount: number
	paymentTransactionId: string | null
	externalReference: string | null
	basis: string
	calculationSnapshotJson: unknown
	appliedAt: Date
	appliedBy: string | null
	createdAt: Date
}
