import type { RefundLedger } from "../../domain/refund-ledger"
import type { RefundQuote } from "../../domain/refund-quote"

export type RefundCalculationRepositoryPort = {
	saveQuoteIfAbsentByIdempotencyKey(quote: RefundQuote): Promise<{
		quote: RefundQuote
		created: boolean
	}>
	findQuoteById(id: string): Promise<RefundQuote | null>
	findQuotesByBookingId(bookingId: string): Promise<RefundQuote[]>
	recordLedgerEntry(entry: RefundLedger): Promise<RefundLedger>
	findLedgerByBookingId(bookingId: string): Promise<RefundLedger[]>
}
