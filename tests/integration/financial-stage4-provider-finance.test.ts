import { describe, expect, it } from "vitest"

import { buildProviderFinanceMaterialization } from "@/modules/financial/application/use-cases/build-provider-finance-materialization"
import { buildProviderFinanceSummary } from "@/modules/financial/application/use-cases/build-provider-finance-summary"
import type {
	CommissionSnapshot,
	FinancialSettlementRecord,
	ProviderFinancialProfile,
	ProviderPayableSnapshot,
	ReconciliationMatch,
} from "@/modules/financial/public"

const providerId = "provider_stage4"
const bookingId = "booking_stage4_1"
const now = new Date("2026-05-15T12:00:00Z")

const bookingRows = [
	{
		bookingId,
		status: "confirmed",
		currency: "USD",
		confirmedAt: now,
		detailId: "detail_stage4_1",
		detailTotalPrice: 160,
		detailTaxes: 16,
		providerIdSnapshot: providerId,
		productNameSnapshot: "Snapshot Stay",
		variantNameSnapshot: "Suite",
		productName: "Live Stay",
		variantName: "Live Suite",
	},
	{
		bookingId,
		status: "confirmed",
		currency: "USD",
		confirmedAt: now,
		detailId: "detail_stage4_2",
		detailTotalPrice: 40,
		detailTaxes: 4,
		providerIdSnapshot: providerId,
		productNameSnapshot: "Snapshot Stay",
		variantNameSnapshot: "Room",
		productName: "Live Stay",
		variantName: "Live Room",
	},
]

function profile(overrides: Partial<ProviderFinancialProfile> = {}): ProviderFinancialProfile {
	return {
		providerId,
		payoutMethodReference: "method_visible_1",
		payoutSchedule: "weekly",
		currency: "USD",
		taxProfileStatus: "verified",
		status: "ready",
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function commission(overrides: Partial<CommissionSnapshot> = {}): CommissionSnapshot {
	return {
		id: "commission_stage4_1",
		bookingId,
		providerId,
		commissionRate: 0.15,
		commissionAmount: 30,
		basis: "booking_room_detail_snapshot",
		currency: "USD",
		snapshotAt: now,
		createdAt: now,
		...overrides,
	}
}

function payable(overrides: Partial<ProviderPayableSnapshot> = {}): ProviderPayableSnapshot {
	return {
		id: "payable_stage4_1",
		bookingId,
		providerId,
		grossAmount: 200,
		commissionAmount: 30,
		taxAmount: 20,
		netPayable: 150,
		currency: "USD",
		basis: "booking_room_detail_snapshot_commission_snapshot",
		snapshotAt: now,
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function match(overrides: Partial<ReconciliationMatch> = {}): ReconciliationMatch {
	return {
		id: "match_stage4_1",
		bookingId,
		providerId,
		contractAmount: 200,
		paymentAmount: 200,
		settlementAmount: 200,
		differenceAmount: 0,
		status: "matched",
		mismatchReasons: [],
		basis: "booking_room_detail_snapshot:stage3_payment_transaction:stage3_settlement_record",
		comparisonFingerprint: "fingerprint_fresh",
		reviewStatus: "unreviewed",
		reviewState: "fresh",
		reviewFingerprint: null,
		reviewedAt: null,
		reviewedBy: null,
		reviewNote: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function settlement(overrides: Partial<FinancialSettlementRecord> = {}): FinancialSettlementRecord {
	return {
		id: "settlement_stage4_1",
		bookingId,
		providerId,
		settlementReference: "settlement_visible_1",
		amount: 200,
		currency: "USD",
		settlementDate: now,
		source: "import",
		matchedAt: null,
		createdAt: now,
		...overrides,
	}
}

describe("integration/financial Stage 4 provider finance foundation", () => {
	it("blocks payout visibility when the commission snapshot is missing instead of inventing commission", () => {
		const summary = buildProviderFinanceSummary({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			profile: profile(),
			commissionSnapshots: [],
			payableSnapshots: [],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(summary.items[0]?.grossAmount).toBe(200)
		expect(summary.items[0]?.commissionAmount).toBeNull()
		expect(summary.items[0]?.blockedReasons).toContain("commission_snapshot_missing")
		expect(summary.items[0]?.blockingDetails).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "commission_snapshot_missing",
					owner: "provider_finance",
					basis: "commission_snapshot",
				}),
			])
		)
		expect(summary.items[0]?.nextOperationalAction).toBe(
			"Refresh commission snapshot from persisted contract snapshots."
		)
		expect(summary.items[0]?.snapshotLifecycle.freshness).toBe("blocked")
		expect(summary.items[0]?.commission.provenance).toEqual(
			expect.objectContaining({
				basis: "missing_commission_snapshot",
				freshness: "blocked",
				snapshotAt: null,
			})
		)
		expect(summary.items[0]?.payable.provenance).toEqual(
			expect.objectContaining({
				basis: "pending_commission_snapshot",
				profileReady: true,
				statementState: "blocked",
			})
		)
		expect(summary.summary.commissionSnapshotMissing).toBe(1)
		expect(summary.summary.payoutBlocked).toBe(1)
	})

	it("marks payout reference visibility as missing only after profile, payable and reconciliation are ready", () => {
		const summary = buildProviderFinanceSummary({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			profile: profile(),
			commissionSnapshots: [commission()],
			payableSnapshots: [payable()],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(summary.items[0]?.blockedReasons).toEqual([])
		expect(summary.items[0]?.eligibilityStatus).toBe("pending_reference")
		expect(summary.items[0]?.operationalOwner).toBe("external_finance")
		expect(summary.items[0]?.nextOperationalAction).toBe(
			"Record external finance reference when operational evidence is available."
		)
		expect(summary.summary.payoutReferenceMissing).toBe(1)
		expect(summary.summary.totalNetPayableVisible).toBe(150)
	})

	it("treats stale or mismatched reconciliation as provider finance review visibility, not payout execution", () => {
		const summary = buildProviderFinanceSummary({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			profile: profile(),
			commissionSnapshots: [commission()],
			payableSnapshots: [payable()],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [match({ status: "mismatch", reviewState: "stale" })],
			settlementRecords: [settlement()],
		})

		expect(summary.items[0]?.blockedReasons).toEqual(
			expect.arrayContaining(["provider_finance_dispute"])
		)
		expect(summary.items[0]?.blockingDetails).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "provider_finance_dispute",
					owner: "financial_operations",
					basis: "reconciliation_match",
				}),
			])
		)
		expect(summary.items[0]?.eligibilityStatus).toBe("blocked")
		expect(summary.summary.providerFinanceDispute).toBe(1)
		expect(summary.summary.payoutBlocked).toBe(1)
	})

	it("detects stale commission and payable snapshots from deterministic snapshot materialization", () => {
		const materialization = buildProviderFinanceMaterialization({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			commissionSnapshots: [commission({ commissionAmount: 25 })],
			payableSnapshots: [payable({ commissionAmount: 25, netPayable: 155 })],
			statements: [],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(materialization.items[0]?.commission.state).toBe("stale")
		expect(materialization.items[0]?.commission.staleReasons).toContain("commission_amount_stale")
		expect(materialization.items[0]?.payable.state).toBe("stale")
		expect(materialization.items[0]?.payable.staleReasons).toEqual(
			expect.arrayContaining(["payable_commission_amount_stale", "payable_net_amount_stale"])
		)
		expect(materialization.items[0]?.contract.fingerprint).toMatch(/^pf_/)
	})

	it("surfaces snapshot freshness and statement stale reasons as operational guidance", () => {
		const summary = buildProviderFinanceSummary({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			profile: profile(),
			commissionSnapshots: [commission({ commissionAmount: 25 })],
			payableSnapshots: [payable({ commissionAmount: 25, netPayable: 155 })],
			payoutRecords: [],
			statements: [],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(summary.items[0]?.snapshotLifecycle.freshness).toBe("stale")
		expect(summary.items[0]?.snapshotLifecycle.staleReasons).toEqual(
			expect.arrayContaining(["commission_amount_stale", "payable_net_amount_stale"])
		)
		expect(summary.items[0]?.blockingDetails).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "commission_snapshot_missing",
					nextOperationalAction: "Refresh commission snapshot from persisted contract snapshots.",
				}),
			])
		)
		expect(summary.items[0]?.statement.nextOperationalAction).toBe(
			"Prepare statement read artifact from fresh payable snapshots."
		)
		expect(summary.statementDraft.provenance).toEqual(
			expect.objectContaining({
				aggregationSource: "ProviderPayableSnapshot",
				contractSource: "BookingRoomDetail",
				reconciliationSource: "ReconciliationMatch",
				includedBookingIds: [],
				excludedBookingIds: [bookingId],
			})
		)
		expect(summary.statementDraft.lifecycle).toEqual(
			expect.objectContaining({
				persistedStatementId: null,
				persistedStatementStatus: null,
				materializationState: "pending",
				owner: "provider_finance",
				invalidationReasons: expect.arrayContaining([
					"commission_amount_stale",
					"payable_net_amount_stale",
				]),
			})
		)
		expect(summary.statementDraft.dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "CommissionSnapshot",
					state: "stale",
					staleReasons: expect.arrayContaining(["commission_amount_stale"]),
				}),
				expect.objectContaining({
					source: "ProviderPayableSnapshot",
					state: "stale",
					staleReasons: expect.arrayContaining(["payable_net_amount_stale"]),
				}),
			])
		)
	})

	it("builds statement draft aggregation from fresh payable snapshots without accounting semantics", () => {
		const materialization = buildProviderFinanceMaterialization({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			commissionSnapshots: [commission()],
			payableSnapshots: [payable()],
			statements: [],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(materialization.statement.status).toBe("pending")
		expect(materialization.statement.freshness).toBe("pending")
		expect(materialization.statement.lifecycle).toEqual(
			expect.objectContaining({
				persistedStatementId: null,
				persistedStatementStatus: null,
				materializationState: "pending",
				owner: "provider_finance",
				invalidationReasons: [],
				nextOperationalAction: "Prepare statement read artifact from fresh payable snapshots.",
			})
		)
		expect(materialization.statement.totalGrossAmount).toBe(200)
		expect(materialization.statement.totalCommissionAmount).toBe(30)
		expect(materialization.statement.totalTaxAmount).toBe(20)
		expect(materialization.statement.totalNetPayable).toBe(150)
		expect(materialization.statement.fingerprint).toMatch(/^pf_/)
		expect(materialization.statement.provenance).toEqual(
			expect.objectContaining({
				aggregationSource: "ProviderPayableSnapshot",
				contractSource: "BookingRoomDetail",
				taxSource: "BookingTaxFee",
				reconciliationSource: "ReconciliationMatch",
				statementSource: "ProviderStatement",
				includedBookingIds: [bookingId],
				excludedBookingIds: [],
			})
		)
		expect(materialization.statement.dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ source: "BookingRoomDetail", state: "fresh", count: 2 }),
				expect.objectContaining({ source: "ProviderPayableSnapshot", state: "fresh", count: 1 }),
				expect.objectContaining({ source: "ReconciliationMatch", state: "fresh", count: 1 }),
				expect.objectContaining({ source: "ProviderStatement", state: "missing", count: 0 }),
			])
		)
		expect(materialization.statement.nextOperationalAction).toBe(
			"Prepare statement read artifact from fresh payable snapshots."
		)
	})

	it("marks visible statements stale when persisted totals drift from payable snapshots", () => {
		const summary = buildProviderFinanceSummary({
			providerId,
			bookingRows,
			taxRows: [{ bookingId, totalAmount: 20 }],
			profile: profile(),
			commissionSnapshots: [commission()],
			payableSnapshots: [payable()],
			payoutRecords: [],
			statements: [
				{
					id: "statement_stage4_1",
					providerId,
					statementReference: "statement_visible_1",
					periodStart: null,
					periodEnd: null,
					status: "visible",
					totalGrossAmount: 199,
					totalCommissionAmount: 30,
					totalTaxAmount: 20,
					totalNetPayable: 150,
					currency: "USD",
					basis: "provider_payable_snapshot_aggregation",
					createdAt: now,
					updatedAt: now,
				},
			],
			reconciliationMatches: [match()],
			settlementRecords: [settlement()],
		})

		expect(summary.statementDraft.status).toBe("stale")
		expect(summary.statementDraft.freshness).toBe("stale")
		expect(summary.statementDraft.lifecycle).toEqual(
			expect.objectContaining({
				persistedStatementId: "statement_stage4_1",
				persistedStatementStatus: "visible",
				materializationState: "stale",
				owner: "provider_finance",
				invalidationReasons: expect.arrayContaining(["statement_gross_amount_stale"]),
			})
		)
		expect(summary.statementDraft.staleReasons).toContain("statement_gross_amount_stale")
		expect(summary.items[0]?.statement.state).toBe("stale")
		expect(summary.items[0]?.statement.lifecycle.persistedStatementId).toBe("statement_stage4_1")
		expect(summary.items[0]?.statement.staleReasons).toContain("statement_gross_amount_stale")
		expect(summary.items[0]?.statement.dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "ProviderStatement",
					state: "stale",
					staleReasons: expect.arrayContaining(["statement_gross_amount_stale"]),
				}),
			])
		)
		expect(summary.items[0]?.statement.provenance.includedBookingIds).toEqual([bookingId])
		expect(summary.items[0]?.statement.nextOperationalAction).toBe(
			"Review statement draft totals against fresh payable snapshots."
		)
		expect(summary.summary.providerStatementPending).toBe(1)
	})
})
