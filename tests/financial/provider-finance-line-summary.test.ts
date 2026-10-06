import { describe, expect, it } from "vitest"

import {
	aggregateProviderFinanceByCommercialLine,
	buildProviderFinanceSummary,
} from "@/modules/financial/application/use-cases/build-provider-finance-summary"

describe("provider-finance line summary", () => {
	it("aggregates totals by commercial line", () => {
		const summary = buildProviderFinanceSummary({
			providerId: "prov_1",
			bookingRows: [
				{
					bookingId: "b1",
					status: "confirmed",
					currency: "USD",
					confirmedAt: null,
					detailId: "d1",
					detailTotalAmount: 100,
					detailTaxAmount: 0,
					providerIdSnapshot: "prov_1",
					productIdSnapshot: "tour-1",
					productType: "Tour",
					productNameSnapshot: "Tour",
					variantNameSnapshot: "Salida",
				},
				{
					bookingId: "b2",
					status: "confirmed",
					currency: "USD",
					confirmedAt: null,
					detailId: "d2",
					detailTotalAmount: 200,
					detailTaxAmount: 0,
					providerIdSnapshot: "prov_1",
					productIdSnapshot: "hotel-1",
					productType: "hotel",
					productNameSnapshot: "Hotel",
					variantNameSnapshot: "Hab",
				},
			],
			taxRows: [],
			profile: null,
			commissionSnapshots: [
				{
					id: "c1",
					bookingId: "b1",
					providerId: "prov_1",
					commercialLine: "tour",
					agreementVersion: "tour:v1",
					commissionRate: 0.1,
					commissionAmount: 10,
					basis: "booking_line_item_snapshot",
					currency: "USD",
					snapshotAt: new Date(),
					createdAt: new Date(),
				},
			],
			payableSnapshots: [],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [],
			settlementRecords: [],
		})

		expect(summary.items[0]?.commercialLine).toBe("tour")
		expect(summary.summary.byCommercialLineBasis).toBe("page")
		expect(summary.summary.byCommercialLine).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ line: "tour", bookingCount: 1, totalGrossAmount: 100 }),
				expect.objectContaining({ line: "lodging", bookingCount: 1, totalGrossAmount: 200 }),
			])
		)
	})

	it("prefers the scope-wide aggregate over the page so pagination does not change the breakdown", () => {
		const scopeRows = [
			{ bookingId: "b1", grossAmount: 100, productType: "tour" },
			{ bookingId: "b2", grossAmount: 200, productType: "hotel" },
			{ bookingId: "b3", grossAmount: 300, productType: null, productTypeFallback: "tour" },
		]
		const scopeLineSummary = aggregateProviderFinanceByCommercialLine({
			rows: scopeRows,
			commissionSnapshots: [{ bookingId: "b1", commissionAmount: 10 }],
			payableSnapshots: [{ bookingId: "b3", netPayable: 250 }],
		})
		expect(scopeLineSummary).toEqual([
			expect.objectContaining({ line: "lodging", bookingCount: 1, commissionSnapshotMissing: 1 }),
			expect.objectContaining({
				line: "tour",
				bookingCount: 2,
				totalGrossAmount: 400,
				totalCommissionAmount: 10,
				totalNetPayableVisible: 250,
				commissionSnapshotMissing: 1,
			}),
		])

		const pageOne = buildProviderFinanceSummary({
			providerId: "prov_1",
			bookingRows: [
				{
					bookingId: "b1",
					status: "confirmed",
					currency: "USD",
					confirmedAt: null,
					detailId: "d1",
					detailTotalAmount: 100,
					detailTaxAmount: 0,
					providerIdSnapshot: "prov_1",
					productType: "tour",
					productNameSnapshot: "Tour",
					variantNameSnapshot: "Salida",
				},
			],
			taxRows: [],
			profile: null,
			commissionSnapshots: [],
			payableSnapshots: [],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [],
			settlementRecords: [],
			scopeLineSummary,
		})
		expect(pageOne.summary.byCommercialLineBasis).toBe("full_scope")
		expect(pageOne.summary.byCommercialLine).toEqual(scopeLineSummary)
	})
})
