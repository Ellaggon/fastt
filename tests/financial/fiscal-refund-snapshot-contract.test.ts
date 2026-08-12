import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)

test("refund context derives fiscal lines from the booked PriceQuote", () => {
	const source = readFileSync(
		new URL("src/lib/financial/refundCancellationContext.ts", root),
		"utf8"
	)
	expect(source).toContain("pricingBreakdownJson")
	expect(source).toContain("isPriceQuote")
	expect(source).toContain("recauda ${line.collectionResponsibility}")
	expect(source).toContain("price_quote:${priceQuote.quoteId}")
})
