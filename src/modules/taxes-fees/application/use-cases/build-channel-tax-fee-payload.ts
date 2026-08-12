import type { PriceQuote } from "@/modules/pricing/public"

export function buildChannelTaxFeePayload(input: { quote: PriceQuote; channel: string }) {
	const lines = [
		...input.quote.taxesAndFees.taxes.included,
		...input.quote.taxesAndFees.taxes.excluded,
		...input.quote.taxesAndFees.fees.included,
		...input.quote.taxesAndFees.fees.excluded,
	]
	return {
		version: "tax_fee_channel_v1" as const,
		channel: String(input.channel).trim().toLowerCase(),
		priceQuoteId: input.quote.quoteId,
		currency: input.quote.currency,
		taxesAndFees: lines.map((line) => ({
			code: line.code,
			name: line.name,
			kind: line.kind,
			amount: line.amount,
			included: line.inclusionType === "included",
			collectionResponsibility: line.collectionResponsibility,
			taxableBase: line.taxableBase,
		})),
	}
}
