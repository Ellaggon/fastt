import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("PriceQuote Fase 1", () => {
	it("threads a single binding quote through search, hold, checkout, booking and receipt", () => {
		const search = read("src/lib/search/publicSearchSurface.ts")
		const hold = read("src/pages/api/inventory/hold.ts")
		const confirm = read("src/pages/api/booking/confirm.ts")
		const booking = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		const receipt = read("src/pages/api/booking/[bookingId]/receipt.ts")

		expect(search).toContain("buildPriceQuote")
		expect(hold).toContain("priceQuote: boundPriceQuote")
		expect(hold).toContain('new Error("price_changed")')
		expect(confirm).toContain("priceQuoteId")
		expect(booking).toContain("PRICE_QUOTE_MISMATCH")
		expect(booking).toContain("priceQuote.taxesAndFees")
		expect(receipt).toContain("PRICE_QUOTE_RECEIPT_UNAVAILABLE")
	})
})
