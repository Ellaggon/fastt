import { describe, expect, it } from "vitest"

import { buildBookingReceipt } from "@/modules/booking/public"
import { buildPriceQuote, isPriceQuote, quoteExtraAmount } from "@/modules/pricing/public"

describe("PriceQuote contract", () => {
	it("keeps the guest total and receipt immutable across lifecycle reads", () => {
		const quote = buildPriceQuote({
			issuedAt: "2026-08-11T00:00:00.000Z",
			context: {
				productId: "product_1",
				variantId: "variant_1",
				ratePlanId: "rate_1",
				checkIn: "2026-09-10",
				checkOut: "2026-09-12",
				rooms: 1,
				occupancy: { adults: 2, children: 0, infants: 0 },
				channel: "web",
			},
			currency: "USD",
			nights: 2,
			baseAmount: 100,
			taxesAndFees: {
				base: 100,
				taxes: {
					included: [],
					excluded: [
						{
							definitionId: "tax_1",
							code: "VAT",
							name: "IVA",
							kind: "tax",
							calculationType: "percentage",
							value: 10,
							currency: null,
							inclusionType: "excluded",
							appliesPer: "stay",
							priority: 0,
							amount: 10,
							source: "rate_plan",
						},
					],
				},
				fees: { included: [], excluded: [] },
				total: 110,
			},
			pricing: {
				days: [
					{ date: "2026-09-10", price: 50 },
					{ date: "2026-09-11", price: 50 },
				],
				source: "v2",
			},
		})

		expect(isPriceQuote(quote)).toBe(true)
		expect(quote.totalAmount).toBe(110)
		expect(quoteExtraAmount(quote)).toBe(10)

		const receipt = buildBookingReceipt({
			bookingId: "booking_1",
			status: "confirmed",
			issuedAt: "2026-08-11T00:01:00.000Z",
			quote,
		})
		expect(receipt.priceQuoteId).toBe(quote.quoteId)
		expect(receipt.baseAmount).toBe(100)
		expect(receipt.added).toHaveLength(1)
		expect(receipt.totalAmount).toBe(110)
	})

	it("uses the same quote id for the same commercial terms", () => {
		const build = (issuedAt: string) =>
			buildPriceQuote({
				issuedAt,
				context: {
					productId: "p",
					variantId: "v",
					ratePlanId: "r",
					checkIn: "2026-09-10",
					checkOut: "2026-09-11",
					rooms: 1,
					occupancy: { adults: 1, children: 0, infants: 0 },
					channel: "web",
				},
				currency: "USD",
				nights: 1,
				baseAmount: 80,
				taxesAndFees: {
					base: 80,
					taxes: { included: [], excluded: [] },
					fees: { included: [], excluded: [] },
					total: 80,
				},
				pricing: { days: [{ date: "2026-09-10", price: 80 }], source: "v2" },
			})

		expect(build("2026-01-01T00:00:00.000Z").quoteId).toBe(
			build("2026-02-01T00:00:00.000Z").quoteId
		)
	})
})
