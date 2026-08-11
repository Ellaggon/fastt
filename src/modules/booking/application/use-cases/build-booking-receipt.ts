import type { PriceQuote } from "@/modules/pricing/public"

export function buildBookingReceipt(input: {
	bookingId: string
	status: string
	issuedAt: Date | string | null
	quote: PriceQuote
}) {
	const { quote } = input
	const included = [...quote.taxesAndFees.taxes.included, ...quote.taxesAndFees.fees.included]
	const added = [...quote.taxesAndFees.taxes.excluded, ...quote.taxesAndFees.fees.excluded]
	return {
		receiptId: `receipt_${input.bookingId}`,
		bookingId: input.bookingId,
		status: input.status,
		issuedAt: input.issuedAt ? new Date(input.issuedAt).toISOString() : quote.issuedAt,
		priceQuoteId: quote.quoteId,
		currency: quote.currency,
		baseAmount: quote.baseAmount,
		included,
		added,
		totalAmount: quote.totalAmount,
	}
}
