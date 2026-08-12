import { describe, expect, it } from "vitest"

import { buildPriceQuote } from "@/modules/pricing/public"
import {
	buildFiscalReport,
	fiscalReportCsv,
	listJurisdictionTaxRuleSuggestions,
} from "@/modules/taxes-fees/public"

const quote = buildPriceQuote({
	source: "hold",
	context: {
		productId: "product-1", variantId: "variant-1", ratePlanId: "plan-1", checkIn: "2026-08-20", checkOut: "2026-08-21", rooms: 1,
		occupancy: { adults: 2, children: 0, infants: 0 }, channel: "web",
	},
	currency: "USD",
	nights: 1,
	baseAmount: 100,
	taxesAndFees: {
		base: 100,
		taxes: {
			included: [
				{
					definitionId: "tax-1",
					code: "VAT",
					name: "VAT",
					kind: "tax",
					calculationType: "percentage",
					value: 10,
					currency: null,
					inclusionType: "included",
					appliesPer: "stay",
					priority: 0,
					amount: 10,
					collectionResponsibility: "provider",
					taxableBase: "booking_base",
					source: { scope: "product", scopeId: "product-1", definitionId: "tax-1" },
				},
			],
			excluded: [],
		},
		fees: {
			included: [],
			excluded: [
				{
					definitionId: "fee-1",
					code: "SERVICE",
					name: "Service",
					kind: "fee",
					calculationType: "fixed",
					value: 5,
					currency: "USD",
					inclusionType: "excluded",
					appliesPer: "stay",
					priority: 1,
					amount: 5,
					collectionResponsibility: "platform",
					taxableBase: "booking_base",
					source: { scope: "product", scopeId: "product-1", definitionId: "fee-1" },
				},
			],
		},
		total: 105,
	},
	pricing: { days: [{ date: "2026-08-20", price: 100 }], source: "v2", breakdownV2: null },
})

describe("taxes-fees/buildFiscalReport", () => {
	it("reports booked snapshots and separates collection responsibility", () => {
		const report = buildFiscalReport({
			bookings: [{ bookingId: "booking-1", status: "confirmed", currency: "USD", confirmedAt: new Date("2026-08-01T12:00:00Z"), totalAmount: 105, pricingBreakdownJson: { priceQuote: quote } }],
			taxSnapshots: [{ bookingId: "booking-1", totalAmount: 15 }],
			refunds: [{ bookingId: "booking-1", refundAmount: 20, status: "applied" }],
		})
		expect(report.rows[0]).toMatchObject({ taxAmount: 10, feeAmount: 5, providerCollectedAmount: 10, platformCollectedAmount: 5, refundedAmount: 20, reconciliationStatus: "reconciled" })
		expect(fiscalReportCsv(report)).toContain('"booking-1"')
	})

	it("flags reservations with no fiscal snapshot for human review", () => {
		const report = buildFiscalReport({
			bookings: [{ bookingId: "booking-2", status: "confirmed", currency: "USD", confirmedAt: null, totalAmount: 100, pricingBreakdownJson: null }],
			taxSnapshots: [], refunds: [],
		})
		expect(report.rows[0]).toMatchObject({ reconciliationStatus: "needs_review", mismatchReasons: ["missing_fiscal_snapshot"] })
	})

	it("only exposes jurisdiction templates as reviewable drafts", () => {
		const [suggestion] = listJurisdictionTaxRuleSuggestions("CL")
		expect(suggestion).toMatchObject({ country: "CL", id: "CL_REVIEW_TAX_PERCENTAGE" })
		expect(suggestion.draft.code).toContain("REVIEW")
	})
})
