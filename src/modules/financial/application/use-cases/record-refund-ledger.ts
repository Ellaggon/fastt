import type { RefundLedger } from "../../domain/refund-ledger"
import type { RefundQuote } from "../../domain/refund-quote"

export type RecordRefundLedgerInput = {
	quote: RefundQuote
	id?: string
	paymentTransactionId?: string | null
	externalReference?: string | null
	appliedAt: Date
	appliedBy?: string | null
}

export function buildRefundLedgerEntry(input: RecordRefundLedgerInput): RefundLedger {
	const quote = input.quote
	if (quote.status !== "quoted") {
		throw new Error(`REFUND_QUOTE_NOT_RECORDABLE:${quote.status}`)
	}
	return {
		id: input.id ?? crypto.randomUUID(),
		refundQuoteId: quote.id,
		bookingId: quote.bookingId,
		providerId: quote.providerId,
		status: "recorded",
		currency: quote.currency,
		refundAmount: quote.refundAmount,
		payoutImpactAmount: quote.payoutImpactAmount,
		paymentTransactionId: input.paymentTransactionId ?? null,
		externalReference: input.externalReference ?? null,
		basis: "refund_quote",
		calculationSnapshotJson: {
			quoteId: quote.id,
			quotePolicySnapshot: quote.policySnapshot,
			quoteCalculationSnapshot: quote.calculationSnapshotJson,
			lines: quote.lines,
		},
		appliedAt: input.appliedAt,
		appliedBy: input.appliedBy ?? null,
		createdAt: new Date(),
	}
}
