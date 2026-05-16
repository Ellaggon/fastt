import type { CommissionSnapshot } from "../../domain/commission-snapshot"
import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { PayoutRecord } from "../../domain/payout-record"
import type { ProviderFinancialProfile } from "../../domain/provider-financial-profile"
import type { ProviderPayableSnapshot } from "../../domain/provider-payable-snapshot"
import type { ProviderStatement } from "../../domain/provider-statement"
import type { ReconciliationMatch } from "../../domain/reconciliation-match"

export type ProviderFinanceBookingSnapshotRow = {
	bookingId: string
	status: unknown
	currency: unknown
	confirmedAt: unknown
	detailId: unknown
	detailTotalPrice: unknown
	detailTaxes: unknown
	providerIdSnapshot: unknown
	productNameSnapshot: unknown
	variantNameSnapshot: unknown
	ratePlanNameSnapshot?: unknown
}

export type ProviderFinanceTaxSnapshotRow = {
	bookingId: string
	totalAmount?: unknown
}

export type ProviderFinanceQueueCode =
	| "payout_blocked"
	| "commission_snapshot_missing"
	| "provider_profile_incomplete"
	| "provider_statement_pending"
	| "payout_reference_missing"
	| "provider_finance_dispute"

export type ProviderFinanceReviewItem = {
	bookingId: string
	providerId: string
	currency: string
	grossAmount: number
	commissionAmount: number | null
	taxAmount: number
	netPayable: number | null
	eligibilityStatus: "eligible" | "blocked" | "pending_reference" | "recorded" | "unknown"
	blockedReasons: ProviderFinanceQueueCode[]
	contract: {
		grossAmount: number
		taxAmount: number
		roomSnapshotCount: number
		basis: "booking_room_detail_snapshot"
	}
	commission: {
		snapshot: CommissionSnapshot | null
		missing: boolean
		basis: "commission_snapshot" | "missing_commission_snapshot"
	}
	payable: {
		snapshot: ProviderPayableSnapshot | null
		netPayable: number | null
		basis: "provider_payable_snapshot" | "pending_commission_snapshot"
	}
	reconciliation: {
		match: ReconciliationMatch | null
		readyForPayable: boolean
		blockingStatus: string | null
	}
	settlement: {
		records: FinancialSettlementRecord[]
		visible: boolean
	}
	payout: {
		record: PayoutRecord | null
		status: "eligible" | "blocked" | "pending_reference" | "recorded" | "unknown"
		reasons: ProviderFinanceQueueCode[]
	}
	statement: {
		visible: boolean
		pending: boolean
	}
	queues: ProviderFinanceQueueCode[]
}

export type ProviderFinanceSummary = {
	providerId: string
	profile: ProviderFinancialProfile | null
	items: ProviderFinanceReviewItem[]
	statements: ProviderStatement[]
	summary: {
		totalBookings: number
		payoutBlocked: number
		commissionSnapshotMissing: number
		providerProfileIncomplete: number
		providerStatementPending: number
		payoutReferenceMissing: number
		providerFinanceDispute: number
		totalGrossAmount: number
		totalCommissionAmount: number
		totalTaxAmount: number
		totalNetPayableVisible: number
	}
}

function roundMoney(value: number): number {
	return Number(value.toFixed(2))
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>()
	for (const row of rows) {
		const key = keyFn(row)
		const bucket = grouped.get(key) ?? []
		bucket.push(row)
		grouped.set(key, bucket)
	}
	return grouped
}

function firstCurrency(rows: ProviderFinanceBookingSnapshotRow[]): string {
	const value = rows
		.map((row) =>
			String(row.currency ?? "")
				.trim()
				.toUpperCase()
		)
		.find(Boolean)
	return value || "USD"
}

function isProfileReady(profile: ProviderFinancialProfile | null): boolean {
	return Boolean(
		profile &&
		profile.status === "ready" &&
		profile.taxProfileStatus === "verified" &&
		profile.payoutMethodReference
	)
}

function isReconciliationReady(match: ReconciliationMatch | null): boolean {
	return Boolean(match && match.status === "matched" && (match.reviewState ?? "fresh") !== "stale")
}

export function buildProviderFinanceSummary(params: {
	providerId: string
	bookingRows: ProviderFinanceBookingSnapshotRow[]
	taxRows: ProviderFinanceTaxSnapshotRow[]
	profile: ProviderFinancialProfile | null
	commissionSnapshots: CommissionSnapshot[]
	payableSnapshots: ProviderPayableSnapshot[]
	payoutRecords: PayoutRecord[]
	statements: ProviderStatement[]
	reconciliationMatches: ReconciliationMatch[]
	settlementRecords: FinancialSettlementRecord[]
}): ProviderFinanceSummary {
	const groupedBookings = groupBy(params.bookingRows, (row) => String(row.bookingId))
	const taxByBooking = groupBy(params.taxRows, (row) => String(row.bookingId))
	const commissionByBooking = new Map(params.commissionSnapshots.map((row) => [row.bookingId, row]))
	const payableByBooking = new Map(params.payableSnapshots.map((row) => [row.bookingId, row]))
	const payoutByBooking = new Map(
		params.payoutRecords.filter((row) => row.bookingId).map((row) => [String(row.bookingId), row])
	)
	const reconciliationByBooking = new Map(
		params.reconciliationMatches.map((row) => [row.bookingId, row])
	)
	const settlementByBooking = groupBy(params.settlementRecords, (row) => row.bookingId)
	const profileReady = isProfileReady(params.profile)
	const hasVisibleStatement = params.statements.some(
		(row) => row.status === "visible" || row.status === "recorded"
	)

	const items = [...groupedBookings.entries()].map(([bookingId, rows]) => {
		const currency = firstCurrency(rows)
		const grossAmount = roundMoney(
			rows.reduce((sum, row) => sum + Number(row.detailTotalPrice ?? 0), 0)
		)
		const taxSnapshotTotal = taxByBooking
			.get(bookingId)
			?.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)
		const detailTaxTotal = rows.reduce((sum, row) => sum + Number(row.detailTaxes ?? 0), 0)
		const taxAmount = roundMoney(Number(taxSnapshotTotal ?? detailTaxTotal ?? 0))
		const commission = commissionByBooking.get(bookingId) ?? null
		const payable = payableByBooking.get(bookingId) ?? null
		const payout = payoutByBooking.get(bookingId) ?? null
		const reconciliation = reconciliationByBooking.get(bookingId) ?? null
		const settlements = settlementByBooking.get(bookingId) ?? []
		const reconciliationReady = isReconciliationReady(reconciliation)
		const queues: ProviderFinanceQueueCode[] = []
		if (!profileReady) queues.push("provider_profile_incomplete")
		if (!commission) queues.push("commission_snapshot_missing")
		if (!reconciliationReady) queues.push("provider_finance_dispute")
		if (!hasVisibleStatement) queues.push("provider_statement_pending")
		const blocked = !profileReady || !commission || !reconciliationReady
		if (blocked) queues.push("payout_blocked")
		if (
			!blocked &&
			(!payout || payout.status === "pending_reference" || payout.status === "unknown")
		) {
			queues.push("payout_reference_missing")
		}
		const payoutStatus = payout?.status ?? (blocked ? "blocked" : "pending_reference")
		return {
			bookingId,
			providerId: params.providerId,
			currency,
			grossAmount,
			commissionAmount: commission?.commissionAmount ?? null,
			taxAmount,
			netPayable: payable?.netPayable ?? null,
			eligibilityStatus: payoutStatus,
			blockedReasons: queues.filter(
				(queue) =>
					queue !== "payout_reference_missing" &&
					queue !== "provider_statement_pending" &&
					queue !== "payout_blocked"
			),
			contract: {
				grossAmount,
				taxAmount,
				roomSnapshotCount: rows.filter((row) => row.detailId != null).length,
				basis: "booking_room_detail_snapshot" as const,
			},
			commission: {
				snapshot: commission,
				missing: !commission,
				basis: commission
					? ("commission_snapshot" as const)
					: ("missing_commission_snapshot" as const),
			},
			payable: {
				snapshot: payable,
				netPayable: payable?.netPayable ?? null,
				basis: payable
					? ("provider_payable_snapshot" as const)
					: ("pending_commission_snapshot" as const),
			},
			reconciliation: {
				match: reconciliation,
				readyForPayable: reconciliationReady,
				blockingStatus: reconciliationReady
					? null
					: (reconciliation?.status ?? "missing_reconciliation_match"),
			},
			settlement: {
				records: settlements,
				visible: settlements.length > 0,
			},
			payout: {
				record: payout,
				status: payoutStatus,
				reasons: queues,
			},
			statement: {
				visible: hasVisibleStatement,
				pending: !hasVisibleStatement,
			},
			queues,
		}
	})

	return {
		providerId: params.providerId,
		profile: params.profile,
		items,
		statements: params.statements,
		summary: {
			totalBookings: items.length,
			payoutBlocked: items.filter((item) => item.queues.includes("payout_blocked")).length,
			commissionSnapshotMissing: items.filter((item) =>
				item.queues.includes("commission_snapshot_missing")
			).length,
			providerProfileIncomplete: items.filter((item) =>
				item.queues.includes("provider_profile_incomplete")
			).length,
			providerStatementPending: items.filter((item) =>
				item.queues.includes("provider_statement_pending")
			).length,
			payoutReferenceMissing: items.filter((item) =>
				item.queues.includes("payout_reference_missing")
			).length,
			providerFinanceDispute: items.filter((item) =>
				item.queues.includes("provider_finance_dispute")
			).length,
			totalGrossAmount: roundMoney(items.reduce((sum, item) => sum + item.contract.grossAmount, 0)),
			totalCommissionAmount: roundMoney(
				items.reduce(
					(sum, item) => sum + Number(item.commission.snapshot?.commissionAmount ?? 0),
					0
				)
			),
			totalTaxAmount: roundMoney(items.reduce((sum, item) => sum + item.contract.taxAmount, 0)),
			totalNetPayableVisible: roundMoney(
				items.reduce((sum, item) => sum + Number(item.payable.netPayable ?? 0), 0)
			),
		},
	}
}
