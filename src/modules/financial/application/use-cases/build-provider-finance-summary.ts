import type { CommissionSnapshot } from "../../domain/commission-snapshot"
import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { PayoutRecord } from "../../domain/payout-record"
import type { ProviderFinancialProfile } from "../../domain/provider-financial-profile"
import type { ProviderPayableSnapshot } from "../../domain/provider-payable-snapshot"
import type { ProviderStatement } from "../../domain/provider-statement"
import type { ReconciliationMatch } from "../../domain/reconciliation-match"
import {
	buildProviderFinanceMaterialization,
	type ProviderFinanceMaterializationItem,
	type ProviderFinanceStatementDraft,
} from "./build-provider-finance-materialization"

export type ProviderFinanceBookingSnapshotRow = {
	bookingId: string
	status: unknown
	currency: unknown
	confirmedAt: unknown
	detailId: unknown
	detailTotalAmount: unknown
	detailTaxAmount: unknown
	providerIdSnapshot: unknown
	productIdSnapshot?: unknown
	productId?: unknown
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

export type ProviderFinanceOperationalOwner =
	| "provider_finance"
	| "financial_operations"
	| "provider_followup"
	| "external_finance"

export type ProviderFinanceBlockingDetail = {
	code: ProviderFinanceQueueCode
	owner: ProviderFinanceOperationalOwner
	reason: string
	nextOperationalAction: string
	basis:
		| "profile"
		| "commission_snapshot"
		| "payable_snapshot"
		| "reconciliation_match"
		| "statement"
}

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
	blockingDetails: ProviderFinanceBlockingDetail[]
	operationalOwner: ProviderFinanceOperationalOwner
	nextOperationalAction: string
	contract: {
		productId?: string | null
		productName?: string | null
		grossAmount: number
		taxAmount: number
		roomSnapshotCount: number
		basis: "booking_room_detail_snapshot"
	}
	commission: {
		snapshot: CommissionSnapshot | null
		missing: boolean
		basis: "commission_snapshot" | "missing_commission_snapshot"
		provenance: {
			basis: "booking_room_detail_snapshot" | "missing_commission_snapshot"
			contractFingerprint: string
			snapshotAt: Date | null
			freshness: ProviderFinanceReviewItem["snapshotLifecycle"]["freshness"]
			staleReasons: string[]
		}
	}
	payable: {
		snapshot: ProviderPayableSnapshot | null
		netPayable: number | null
		basis: "provider_payable_snapshot" | "pending_commission_snapshot"
		provenance: {
			basis: "booking_room_detail_snapshot_commission_snapshot" | "pending_commission_snapshot"
			contractFingerprint: string
			commissionFingerprint: string | null
			reconciliationStatus: string | null
			profileReady: boolean
			statementState: ProviderFinanceStatementDraft["status"]
			freshness: ProviderFinanceReviewItem["snapshotLifecycle"]["freshness"]
			staleReasons: string[]
		}
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
		state: ProviderFinanceStatementDraft["status"]
		lifecycle: ProviderFinanceStatementDraft["lifecycle"]
		staleReasons: string[]
		dependencies: ProviderFinanceStatementDraft["dependencies"]
		provenance: ProviderFinanceStatementDraft["provenance"]
		nextOperationalAction: string
	}
	snapshotLifecycle: {
		commissionState: ProviderFinanceMaterializationItem["commission"]["state"]
		payableState: ProviderFinanceMaterializationItem["payable"]["state"]
		contractFingerprint: string
		commissionFingerprint: string | null
		payableFingerprint: string | null
		staleReasons: string[]
		freshness: "fresh" | "stale" | "blocked" | "missing"
	}
	explainability: ProviderFinanceMaterializationItem["explainability"]
	queues: ProviderFinanceQueueCode[]
}

export type ProviderFinanceSummary = {
	providerId: string
	profile: ProviderFinancialProfile | null
	items: ProviderFinanceReviewItem[]
	statements: ProviderStatement[]
	statementDraft: ProviderFinanceStatementDraft
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

const queuePriority: ProviderFinanceQueueCode[] = [
	"provider_profile_incomplete",
	"commission_snapshot_missing",
	"provider_finance_dispute",
	"payout_reference_missing",
	"provider_statement_pending",
	"payout_blocked",
]

function detailForQueue(code: ProviderFinanceQueueCode): ProviderFinanceBlockingDetail {
	switch (code) {
		case "provider_profile_incomplete":
			return {
				code,
				owner: "provider_followup",
				reason: "Provider finance profile is not ready for operational visibility.",
				nextOperationalAction: "Review provider finance profile requirements.",
				basis: "profile",
			}
		case "commission_snapshot_missing":
			return {
				code,
				owner: "provider_finance",
				reason: "Commission snapshot is missing or stale against booking snapshots.",
				nextOperationalAction: "Refresh commission snapshot from persisted contract snapshots.",
				basis: "commission_snapshot",
			}
		case "provider_finance_dispute":
			return {
				code,
				owner: "financial_operations",
				reason: "Reconciliation match is missing, mismatched, or stale.",
				nextOperationalAction:
					"Review reconciliation evidence before provider finance visibility advances.",
				basis: "reconciliation_match",
			}
		case "provider_statement_pending":
			return {
				code,
				owner: "provider_finance",
				reason: "Provider statement read artifact is missing or stale.",
				nextOperationalAction: "Review statement draft totals against fresh payable snapshots.",
				basis: "statement",
			}
		case "payout_reference_missing":
			return {
				code,
				owner: "external_finance",
				reason: "Provider finance reference visibility has not been recorded.",
				nextOperationalAction:
					"Record external finance reference when operational evidence is available.",
				basis: "payable_snapshot",
			}
		case "payout_blocked":
			return {
				code,
				owner: "provider_finance",
				reason: "Provider finance visibility is blocked by upstream operational requirements.",
				nextOperationalAction:
					"Resolve the specific blocking reasons before recording reference visibility.",
				basis: "payable_snapshot",
			}
	}
}

function primaryOperationalDetail(
	details: ProviderFinanceBlockingDetail[]
): ProviderFinanceBlockingDetail | null {
	return (
		queuePriority.map((code) => details.find((detail) => detail.code === code)).find(Boolean) ??
		null
	)
}

function snapshotFreshness(params: {
	commissionState: ProviderFinanceMaterializationItem["commission"]["state"]
	payableState: ProviderFinanceMaterializationItem["payable"]["state"]
}): ProviderFinanceReviewItem["snapshotLifecycle"]["freshness"] {
	if (params.commissionState === "blocked" || params.payableState === "blocked") return "blocked"
	if (params.commissionState === "stale" || params.payableState === "stale") return "stale"
	if (params.commissionState === "missing" || params.payableState === "missing") return "missing"
	return "fresh"
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
	const materialization = buildProviderFinanceMaterialization({
		providerId: params.providerId,
		bookingRows: params.bookingRows,
		taxRows: params.taxRows,
		commissionSnapshots: params.commissionSnapshots,
		payableSnapshots: params.payableSnapshots,
		statements: params.statements,
		reconciliationMatches: params.reconciliationMatches,
		settlementRecords: params.settlementRecords,
	})
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
	const materializationByBooking = new Map(
		materialization.items.map((item) => [item.bookingId, item])
	)

	const items = [...groupedBookings.entries()].map(([bookingId, rows]) => {
		const materialized = materializationByBooking.get(bookingId)
		const currency = firstCurrency(rows)
		const grossAmount = roundMoney(
			rows.reduce((sum, row) => sum + Number(row.detailTotalAmount ?? 0), 0)
		)
		const taxSnapshotTotal = taxByBooking
			.get(bookingId)
			?.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)
		const detailTaxTotal = rows.reduce((sum, row) => sum + Number(row.detailTaxAmount ?? 0), 0)
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
		if (materialized?.commission.state === "stale") queues.push("commission_snapshot_missing")
		if (!reconciliationReady) queues.push("provider_finance_dispute")
		if (!hasVisibleStatement || materialization.statement.status === "stale")
			queues.push("provider_statement_pending")
		const snapshotBlocked =
			materialized?.commission.state === "stale" || materialized?.payable.state === "stale"
		const blocked = !profileReady || !commission || !reconciliationReady || snapshotBlocked
		if (blocked) queues.push("payout_blocked")
		if (
			!blocked &&
			(!payout || payout.status === "pending_reference" || payout.status === "unknown")
		) {
			queues.push("payout_reference_missing")
		}
		const uniqueQueues = [...new Set(queues)]
		const blockingDetails = uniqueQueues.map(detailForQueue)
		const primaryDetail = primaryOperationalDetail(blockingDetails)
		const payoutStatus = payout?.status ?? (blocked ? "blocked" : "pending_reference")
		const commissionState = materialized?.commission.state ?? "missing"
		const payableState = materialized?.payable.state ?? "missing"
		const freshness = snapshotFreshness({ commissionState, payableState })
		const contractFingerprint = materialized?.contract.fingerprint ?? ""
		const commissionFingerprint = materialized?.commission.fingerprint ?? null
		const staleReasons = [
			...(materialized?.commission.staleReasons ?? []),
			...(materialized?.payable.staleReasons ?? []),
		]
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
			blockingDetails,
			operationalOwner: primaryDetail?.owner ?? "provider_finance",
			nextOperationalAction:
				primaryDetail?.nextOperationalAction ?? "Monitor provider finance visibility.",
			contract: {
				productId: String(rows[0]?.productIdSnapshot ?? rows[0]?.productId ?? "").trim() || null,
				productName: String(rows[0]?.productNameSnapshot ?? "").trim() || null,
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
				provenance: {
					basis: commission
						? ("booking_room_detail_snapshot" as const)
						: ("missing_commission_snapshot" as const),
					contractFingerprint,
					snapshotAt: commission?.snapshotAt ?? null,
					freshness,
					staleReasons: materialized?.commission.staleReasons ?? [],
				},
			},
			payable: {
				snapshot: payable,
				netPayable: payable?.netPayable ?? null,
				basis: payable
					? ("provider_payable_snapshot" as const)
					: ("pending_commission_snapshot" as const),
				provenance: {
					basis: payable
						? ("booking_room_detail_snapshot_commission_snapshot" as const)
						: ("pending_commission_snapshot" as const),
					contractFingerprint,
					commissionFingerprint,
					reconciliationStatus: reconciliation?.status ?? null,
					profileReady,
					statementState: materialization.statement.status,
					freshness,
					staleReasons: materialized?.payable.staleReasons ?? [],
				},
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
				pending: materialization.statement.status !== "fresh",
				state: materialization.statement.status,
				lifecycle: materialization.statement.lifecycle,
				staleReasons: materialization.statement.staleReasons,
				dependencies: materialization.statement.dependencies,
				provenance: materialization.statement.provenance,
				nextOperationalAction: materialization.statement.nextOperationalAction,
			},
			snapshotLifecycle: {
				commissionState,
				payableState,
				contractFingerprint,
				commissionFingerprint,
				payableFingerprint: materialized?.payable.fingerprint ?? null,
				staleReasons,
				freshness,
			},
			explainability: materialized?.explainability ?? {
				grossAmountSource: "BookingRoomDetail.totalAmount",
				taxAmountSource: "BookingRoomDetail.taxAmount",
				commissionSource: "missing_commission_snapshot",
				payableSource: "pending_provider_payable_snapshot",
				reconciliationSource: "ReconciliationMatch",
			},
			queues: uniqueQueues,
		}
	})

	return {
		providerId: params.providerId,
		profile: params.profile,
		items,
		statements: params.statements,
		statementDraft: materialization.statement,
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
