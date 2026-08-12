import type { PriceQuote } from "@/modules/pricing/public"

function round(value: number) {
	return Number(value.toFixed(2))
}

export function buildBookingFiscalDocument(input: {
	bookingId: string
	issuedAt: Date | string | null
	quote: PriceQuote
}) {
	const lines = [
		...input.quote.taxesAndFees.taxes.included,
		...input.quote.taxesAndFees.taxes.excluded,
		...input.quote.taxesAndFees.fees.included,
		...input.quote.taxesAndFees.fees.excluded,
	]
	const collection = { provider: 0, platform: 0, marketplace: 0 }
	for (const line of lines) collection[line.collectionResponsibility] += Number(line.amount ?? 0)
	return {
		documentId: `fiscal_${input.bookingId}_${input.quote.quoteId.slice(-8)}`,
		documentType: "fiscal_snapshot" as const,
		status: "snapshot_ready" as const,
		bookingId: input.bookingId,
		priceQuoteId: input.quote.quoteId,
		issuedAt: input.issuedAt ? new Date(input.issuedAt).toISOString() : input.quote.issuedAt,
		currency: input.quote.currency,
		baseAmount: input.quote.baseAmount,
		totalAmount: input.quote.totalAmount,
		collection: {
			provider: round(collection.provider),
			platform: round(collection.platform),
			marketplace: round(collection.marketplace),
		},
		lines,
	}
}
