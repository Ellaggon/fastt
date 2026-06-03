import type { RefundCalculationRepositoryPort } from "../ports/RefundCalculationRepositoryPort"
import { buildRefundLedgerEntry } from "./record-refund-ledger"

export async function recordRefundLedgerFromQuote(
	deps: { repo: RefundCalculationRepositoryPort },
	input: {
		refundQuoteId: string
		paymentTransactionId?: string | null
		externalReference?: string | null
		appliedAt: Date
		appliedBy?: string | null
	}
) {
	const quote = await deps.repo.findQuoteById(String(input.refundQuoteId ?? "").trim())
	if (!quote) throw new Error("REFUND_QUOTE_NOT_FOUND")
	const entry = buildRefundLedgerEntry({
		quote,
		paymentTransactionId: input.paymentTransactionId,
		externalReference: input.externalReference,
		appliedAt: input.appliedAt,
		appliedBy: input.appliedBy,
	})
	return deps.repo.recordLedgerEntry(entry)
}
