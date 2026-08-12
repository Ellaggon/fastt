import { expect, test } from "vitest"

import { buildBookingFiscalDocument } from "@/modules/booking/public"
import { buildChannelTaxFeePayload } from "@/modules/taxes-fees/public"
import { buildPriceQuote } from "@/modules/pricing/public"

test("fiscal snapshot feeds document and channel payload without recalculation", () => {
	const quote = buildPriceQuote({
		context: {
			productId: "product-1",
			variantId: "variant-1",
			ratePlanId: "rate-1",
			checkIn: "2026-10-01",
			checkOut: "2026-10-02",
			rooms: 1,
			occupancy: { adults: 2, children: 0, infants: 0 },
			channel: "web",
		},
		currency: "USD",
		nights: 1,
		baseAmount: 100,
		taxesAndFees: {
			base: 100,
			total: 110,
			taxes: {
				included: [],
				excluded: [
					{
						definitionId: "tax-1",
						code: "VAT",
						name: "VAT",
						kind: "tax",
						calculationType: "percentage",
						value: 10,
						currency: null,
						inclusionType: "excluded",
						appliesPer: "stay",
						priority: 0,
						amount: 10,
						collectionResponsibility: "platform",
						taxableBase: "booking_base",
						source: { scope: "product", scopeId: "product-1", definitionId: "tax-1" },
					},
				],
			},
			fees: { included: [], excluded: [] },
		},
		pricing: { days: [{ date: "2026-10-01", price: 100 }], source: "v2", breakdownV2: null },
	})
	const document = buildBookingFiscalDocument({ bookingId: "booking-1", issuedAt: null, quote })
	expect(document.collection.platform).toBe(10)
	expect(document.totalAmount).toBe(110)
	expect(buildChannelTaxFeePayload({ quote, channel: "channex" }).taxesAndFees[0]).toMatchObject({
		code: "VAT",
		included: false,
		collectionResponsibility: "platform",
	})
})
