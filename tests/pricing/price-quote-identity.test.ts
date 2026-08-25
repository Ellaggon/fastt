import { describe, expect, it } from "vitest"

import { buildPriceQuote } from "@/modules/pricing/public"

const taxesAndFees = {
	base: 360,
	taxes: {
		included: [] as never[],
		excluded: [
			{
				definitionId: "tax_marketplace_certification_vat",
				code: "VAT_CERTIFICATION_10",
				name: "IVA certificación 10%",
				kind: "tax" as const,
				calculationType: "percentage" as const,
				value: 10,
				currency: null,
				inclusionType: "excluded" as const,
				appliesPer: "stay" as const,
				priority: 0,
				amount: 36,
				collectionResponsibility: "provider" as const,
				taxableBase: "booking_base" as const,
				source: {
					scope: "provider" as const,
					scopeId: "prov_marketplace_certification",
					definitionId: "tax_marketplace_certification_vat",
				},
			},
		],
	},
	fees: { included: [] as never[], excluded: [] as never[] },
	total: 396,
}

const context = {
	productId: "prod_marketplace_certification_hotel_la_paz",
	variantId: "var_marketplace_certification_hotel_standard",
	ratePlanId: "rate_marketplace_certification_hotel_web",
	checkIn: "2026-09-15",
	checkOut: "2026-09-18",
	rooms: 1,
	occupancy: { adults: 2, children: 0, infants: 0 },
	channel: "web",
}

const days = [
	{ date: "2026-09-15", price: 120 },
	{ date: "2026-09-16", price: 120 },
	{ date: "2026-09-17", price: 120 },
]

function buildSearchQuote(overrides?: {
	days?: typeof days
	taxName?: string
	taxValue?: number
	definitionVersionId?: string | null
}) {
	return buildPriceQuote({
		source: "search",
		context,
		currency: "USD",
		nights: 3,
		baseAmount: 360,
		taxesAndFees: {
			...taxesAndFees,
			taxes: {
				included: [],
				excluded: taxesAndFees.taxes.excluded.map((line) => ({
					...line,
					name: overrides?.taxName ?? line.name,
					value: overrides?.taxValue ?? line.value,
					source: {
						...line.source,
						definitionVersionId: overrides?.definitionVersionId ?? "tax_version_1",
					},
				})),
			},
		},
		pricing: { days: overrides?.days ?? days, source: "materialized_search_view" },
	})
}

describe("PriceQuote identity", () => {
	it("keeps the same id from search and hold when guest terms match", () => {
		const search = buildSearchQuote()
		const hold = buildPriceQuote({
			source: "hold",
			context,
			currency: "USD",
			nights: 3,
			baseAmount: 360,
			taxesAndFees: {
				...taxesAndFees,
				taxes: {
					included: [],
					excluded: taxesAndFees.taxes.excluded.map((line) => ({
						...line,
						source: { ...line.source, definitionVersionId: "tax_version_1" },
					})),
				},
			},
			pricing: {
				days,
				breakdownV2: { base: 360, occupancyAdjustment: 0, rules: 0, final: 360 },
				source: "v2",
			},
		})

		expect(search.quoteId).toBe(hold.quoteId)
		expect(search.totalAmount).toBe(hold.totalAmount)
	})

	it("normalizes day ordering without weakening the commercial fingerprint", () => {
		expect(buildSearchQuote().quoteId).toBe(
			buildSearchQuote({ days: [...days].reverse() }).quoteId
		)
		expect(buildSearchQuote().quoteId).not.toBe(
			buildSearchQuote({
				days: days.map((day, index) => (index === 0 ? { ...day, price: 121 } : day)),
			}).quoteId
		)
	})

	it("changes identity when a displayed tax term or immutable version changes", () => {
		const quote = buildSearchQuote()
		expect(quote.quoteId).not.toBe(buildSearchQuote({ taxName: "IVA actualizado" }).quoteId)
		expect(quote.quoteId).not.toBe(buildSearchQuote({ taxValue: 11 }).quoteId)
		expect(quote.quoteId).not.toBe(
			buildSearchQuote({ definitionVersionId: "tax_version_2" }).quoteId
		)
	})
})
