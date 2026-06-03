import { describe, expect, it } from "vitest"

import { buildFinancialReconciliationMatch } from "@/modules/financial/application/use-cases/build-financial-reconciliation-match"
import type { FinancialSettlementRecord, PaymentTransaction } from "@/modules/financial/public"

const baseGroup = [
	{
		bookingId: "booking_stage3_1",
		status: "confirmed",
		currency: "USD",
		totalAmountUSD: 200,
		totalAmountBOB: 0,
		confirmedAt: new Date("2026-06-01T00:00:00Z"),
		checkInDate: "2026-06-10",
		checkOutDate: "2026-06-12",
		refundHandoffSnapshotJson: null,
		contractSnapshotVersion: "booking_contract_v1",
		detailId: "detail_1",
		detailTotalPrice: 120,
		detailTaxes: 12,
		providerIdSnapshot: "provider_stage3",
		productNameSnapshot: "Snapshot Hotel",
		variantNameSnapshot: "Room A",
		ratePlanNameSnapshot: "Default",
		productName: "Live Hotel",
		variantName: "Live Room",
	},
	{
		bookingId: "booking_stage3_1",
		status: "confirmed",
		currency: "USD",
		totalAmountUSD: 200,
		totalAmountBOB: 0,
		confirmedAt: new Date("2026-06-01T00:00:00Z"),
		checkInDate: "2026-06-10",
		checkOutDate: "2026-06-12",
		refundHandoffSnapshotJson: null,
		contractSnapshotVersion: "booking_contract_v1",
		detailId: "detail_2",
		detailTotalPrice: 80,
		detailTaxes: 8,
		providerIdSnapshot: "provider_stage3",
		productNameSnapshot: "Snapshot Hotel",
		variantNameSnapshot: "Room B",
		ratePlanNameSnapshot: "Default",
		productName: "Live Hotel",
		variantName: "Live Room",
	},
]

function payment(overrides: Partial<PaymentTransaction> = {}): PaymentTransaction {
	const now = new Date("2026-06-01T00:00:00Z")
	return {
		id: "pt_1",
		bookingId: "booking_stage3_1",
		providerId: "provider_stage3",
		type: "capture",
		status: "recorded",
		amount: 200,
		currency: "USD",
		externalReference: "psp_ref_1",
		pspProvider: "test_psp",
		idempotencyKey: "idem_1",
		occurredAt: now,
		source: "import",
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function settlement(overrides: Partial<FinancialSettlementRecord> = {}): FinancialSettlementRecord {
	const now = new Date("2026-06-02T00:00:00Z")
	return {
		id: "fs_1",
		bookingId: "booking_stage3_1",
		providerId: "provider_stage3",
		settlementReference: "settlement_ref_1",
		amount: 200,
		currency: "USD",
		settlementDate: now,
		source: "import",
		matchedAt: null,
		createdAt: now,
		...overrides,
	}
}

describe("integration/financial Stage 3 reconciliation builder", () => {
	it("matches contract/payment/settlement using aggregated multi-room snapshots", () => {
		const match = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [{ bookingId: "booking_stage3_1", totalAmount: 20, breakdownJson: {} }],
			providerId: "provider_stage3",
			paymentTransactions: [payment()],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(match.contractAmount).toBe(200)
		expect(match.paymentAmount).toBe(200)
		expect(match.settlementAmount).toBe(200)
		expect(match.status).toBe("matched")
		expect(match.contract.multiRoomAllocationCount).toBe(2)
	})

	it("detects missing settlement without using compatibility evidence as source of truth", () => {
		const match = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [
				{
					bookingId: "booking_stage3_1",
					type: "settlement_record",
					payload: { grossAmount: 200, id: "external" },
				},
			],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment()],
			settlementRecords: [],
			references: [],
		})
		expect(match.status).toBe("missing_settlement")
		expect(match.settlement.records).toEqual([])
	})

	it("detects amount and currency mismatch from persisted Stage 3 records", () => {
		const amountMismatch = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment({ amount: 207 })],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(amountMismatch.status).toBe("mismatch")
		expect(amountMismatch.differenceAmount).toBe(7)

		const currencyMismatch = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment({ currency: "BOB" })],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(currencyMismatch.status).toBe("currency_mismatch")
	})

	it("explains payment, settlement, capture, and refund/cancellation diagnostics", () => {
		const missingCapture = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment({ type: "authorization" })],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(missingCapture.mismatchReasons).toContain("missing_capture_reference")
		expect(missingCapture.queues).toContain("missing_capture_reference")

		const amountMismatch = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment({ amount: 190 })],
			settlementRecords: [settlement({ amount: 205 })],
			references: [],
		})
		expect(amountMismatch.mismatchReasons).toEqual(
			expect.arrayContaining(["payment_amount_mismatch", "settlement_amount_mismatch"])
		)

		const refundMismatch = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [
				payment({ type: "refund", amount: 20, externalReference: "refund_ref" }),
			],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(refundMismatch.mismatchReasons).toContain("refund_without_matching_cancellation")
	})

	it("builds deterministic comparison fingerprints from snapshots and persisted evidence", () => {
		const first = buildFinancialReconciliationMatch({
			group: baseGroup,
			financialEvidenceRows: [],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment()],
			settlementRecords: [settlement()],
			references: [],
		})
		const second = buildFinancialReconciliationMatch({
			group: [...baseGroup].reverse(),
			financialEvidenceRows: [
				{ bookingId: "booking_stage3_1", type: "payment_intent", payload: { amount: 200 } },
			],
			taxRows: [],
			providerId: "provider_stage3",
			paymentTransactions: [payment()],
			settlementRecords: [settlement()],
			references: [],
		})
		expect(first.comparisonFingerprint).toBe(second.comparisonFingerprint)
	})
})
