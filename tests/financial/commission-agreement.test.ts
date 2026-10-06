import { describe, expect, it } from "vitest"

import {
	COMMISSION_AGREEMENT_VERSION_UNDECLARED,
	commercialLineSummaryLabel,
	isCommissionAgreementDeclared,
	resolveBookingCommercialLineFromRows,
	resolveCommissionAgreement,
} from "@/lib/financial/commissionAgreement"
import {
	buildProviderFinanceMaterialization,
	buildProviderFinanceSummary,
	createCommissionSnapshotForBooking,
	type CommissionSnapshot,
	type CommissionSnapshotRepositoryPort,
} from "@/modules/financial/public"

const now = new Date("2026-06-01T00:00:00.000Z")

function row(overrides: Record<string, unknown> = {}) {
	return {
		bookingId: "b1",
		status: "confirmed",
		currency: "USD",
		confirmedAt: now,
		detailId: "d1",
		detailTotalAmount: 100,
		detailTaxAmount: 0,
		providerIdSnapshot: "prov_1",
		productIdSnapshot: "tour-1",
		productNameSnapshot: "Tour",
		variantNameSnapshot: "Salida",
		...overrides,
	}
}

function commission(overrides: Partial<CommissionSnapshot> = {}): CommissionSnapshot {
	return {
		id: "c1",
		bookingId: "b1",
		providerId: "prov_1",
		commercialLine: "tour",
		agreementVersion: "tour:v1",
		commissionRate: 0.1,
		commissionAmount: 10,
		basis: "booking_line_item_snapshot",
		currency: "USD",
		snapshotAt: now,
		createdAt: now,
		...overrides,
	}
}

describe("commission agreement resolution (G7)", () => {
	it("derives the booking line from the snapshot product before the live variant", () => {
		expect(
			resolveBookingCommercialLineFromRows([{ productType: null, productTypeFallback: "hotel" }])
		).toBe("lodging")
		expect(
			resolveBookingCommercialLineFromRows([
				{ productType: "Tour", productTypeFallback: "hotel" },
			])
		).toBe("tour")
		expect(resolveBookingCommercialLineFromRows([{}])).toBeNull()
	})

	it("only declares an agreement for a line the provider has enrolled", () => {
		expect(resolveCommissionAgreement({ commercialLine: "tour", enrolledLines: ["tour"] })).toEqual({
			commercialLine: "tour",
			agreementVersion: "tour:v1",
		})
		expect(
			resolveCommissionAgreement({ commercialLine: "tour", enrolledLines: ["lodging"] })
		).toEqual({ commercialLine: "tour", agreementVersion: COMMISSION_AGREEMENT_VERSION_UNDECLARED })
		expect(isCommissionAgreementDeclared("tour:v1")).toBe(true)
		expect(isCommissionAgreementDeclared(COMMISSION_AGREEMENT_VERSION_UNDECLARED)).toBe(false)
		expect(isCommissionAgreementDeclared(null)).toBe(false)
	})

	it("labels lines through the vertical vocabulary instead of hardcoded literals", () => {
		expect(commercialLineSummaryLabel("tour")).toBe("Tours")
		expect(commercialLineSummaryLabel("lodging")).toBe("Alojamientos")
	})

	it("the write path never accepts a caller-provided line or agreement", async () => {
		const stored: CommissionSnapshot[] = []
		const port: CommissionSnapshotRepositoryPort = {
			async findByProvider() {
				return stored
			},
			async createIfAbsent(input) {
				const snapshot = { ...input, id: input.id ?? "generated", createdAt: now }
				stored.push(snapshot)
				return { snapshot, created: true }
			},
		}
		const result = await createCommissionSnapshotForBooking(
			{
				commissionSnapshots: port,
				resolveAgreement: async () => ({ commercialLine: "tour", agreementVersion: "tour:v1" }),
			},
			{
				bookingId: "b1",
				providerId: "prov_1",
				commissionRate: 0.1,
				commissionAmount: 10,
				basis: "booking_line_item_snapshot",
				currency: "USD",
				snapshotAt: now,
			}
		)
		expect(result.snapshot.commercialLine).toBe("tour")
		expect(result.snapshot.agreementVersion).toBe("tour:v1")
	})

	it("marks a snapshot frozen under another line or without agreement as stale", () => {
		const base = {
			providerId: "prov_1",
			bookingRows: [row({ productType: "Tour" })],
			taxRows: [],
			profile: null,
			payableSnapshots: [],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [],
			settlementRecords: [],
		}
		const mismatch = buildProviderFinanceMaterialization({
			...base,
			commissionSnapshots: [commission({ commercialLine: "lodging" })],
		})
		expect(mismatch.items[0]?.commission.staleReasons).toContain(
			"commission_commercial_line_mismatch"
		)

		const undeclared = buildProviderFinanceSummary({
			...base,
			commissionSnapshots: [commission({ commercialLine: null, agreementVersion: null })],
		})
		expect(undeclared.items[0]?.snapshotLifecycle.staleReasons).toContain(
			"commission_agreement_undeclared"
		)
		expect(undeclared.items[0]?.queues).toContain("commission_snapshot_missing")

		const fresh = buildProviderFinanceSummary({ ...base, commissionSnapshots: [commission()] })
		expect(fresh.items[0]?.snapshotLifecycle.staleReasons).not.toContain(
			"commission_agreement_undeclared"
		)
	})
})
