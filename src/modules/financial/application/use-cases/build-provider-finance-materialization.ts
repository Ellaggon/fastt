import type { CommissionSnapshot } from "../../domain/commission-snapshot"
import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { ProviderPayableSnapshot } from "../../domain/provider-payable-snapshot"
import type { ProviderStatement } from "../../domain/provider-statement"
import type { ReconciliationMatch } from "../../domain/reconciliation-match"
import type {
	ProviderFinanceBookingSnapshotRow,
	ProviderFinanceTaxSnapshotRow,
} from "./build-provider-finance-summary"

export type ProviderFinanceSnapshotState = "missing" | "fresh" | "stale" | "blocked"
export type ProviderFinanceStatementState = "pending" | "fresh" | "stale" | "blocked"
export type ProviderFinanceStatementDependency = {
	source:
		| "BookingRoomDetail"
		| "BookingTaxFee"
		| "CommissionSnapshot"
		| "ProviderPayableSnapshot"
		| "ReconciliationMatch"
		| "ProviderStatement"
	state: ProviderFinanceSnapshotState | ProviderFinanceStatementState | "visible"
	count: number
	staleReasons: string[]
}

export type ProviderFinanceMaterializationItem = {
	bookingId: string
	providerId: string
	currency: string
	contract: {
		grossAmount: number
		taxAmount: number
		roomSnapshotCount: number
		fingerprint: string
	}
	commission: {
		state: ProviderFinanceSnapshotState
		expectedAmount: number | null
		persistedAmount: number | null
		rate: number | null
		fingerprint: string | null
		staleReasons: string[]
	}
	payable: {
		state: ProviderFinanceSnapshotState
		expectedNetPayable: number | null
		persistedNetPayable: number | null
		fingerprint: string | null
		staleReasons: string[]
	}
	reconciliation: {
		ready: boolean
		status: string
		reviewState: string | null
	}
	settlement: {
		visible: boolean
		count: number
	}
	explainability: {
		grossAmountSource: "BookingRoomDetail.totalAmount"
		taxAmountSource: "BookingTaxFee.totalAmount" | "BookingRoomDetail.taxAmount"
		commissionSource: "CommissionSnapshot" | "missing_commission_snapshot"
		payableSource: "ProviderPayableSnapshot" | "pending_provider_payable_snapshot"
		reconciliationSource: "ReconciliationMatch"
	}
}

export type ProviderFinanceStatementDraft = {
	providerId: string
	status: ProviderFinanceStatementState
	freshness: ProviderFinanceStatementState
	lifecycle: {
		persistedStatementId: string | null
		persistedStatementStatus: ProviderStatement["status"] | null
		materializationState: ProviderFinanceStatementState
		invalidationReasons: string[]
		owner: "provider_finance" | "financial_operations"
		nextOperationalAction: string
	}
	currency: string | null
	totalGrossAmount: number
	totalCommissionAmount: number
	totalTaxAmount: number
	totalNetPayable: number
	bookingCount: number
	fingerprint: string
	staleReasons: string[]
	dependencies: ProviderFinanceStatementDependency[]
	provenance: {
		aggregationSource: "ProviderPayableSnapshot"
		contractSource: "BookingRoomDetail"
		taxSource: "BookingTaxFee" | "BookingRoomDetail"
		reconciliationSource: "ReconciliationMatch"
		statementSource: "ProviderStatement"
		includedBookingIds: string[]
		excludedBookingIds: string[]
	}
	nextOperationalAction: string
	basis: "provider_payable_snapshot_aggregation"
}

export type ProviderFinanceMaterialization = {
	providerId: string
	items: ProviderFinanceMaterializationItem[]
	statement: ProviderFinanceStatementDraft
}

function roundMoney(value: number): number {
	return Number(value.toFixed(2))
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(",")}}`
	}
	return JSON.stringify(value)
}

function stableFingerprint(value: unknown): string {
	const raw = stableStringify(value)
	let hash = 5381
	for (let index = 0; index < raw.length; index += 1) {
		hash = (hash * 33) ^ raw.charCodeAt(index)
	}
	return `pf_${(hash >>> 0).toString(16)}`
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

function reconciliationReady(match: ReconciliationMatch | null): boolean {
	return Boolean(match && match.status === "matched" && (match.reviewState ?? "fresh") !== "stale")
}

function latestStatement(statements: ProviderStatement[]): ProviderStatement | null {
	return (
		statements.find((row) => row.status === "visible" || row.status === "recorded") ??
		statements[0] ??
		null
	)
}

function statementAction(status: ProviderFinanceStatementState): string {
	switch (status) {
		case "blocked":
			return "Resolve blocked payable or currency dependencies before preparing statement visibility."
		case "stale":
			return "Review statement draft totals against fresh payable snapshots."
		case "pending":
			return "Prepare statement read artifact from fresh payable snapshots."
		case "fresh":
			return "Monitor statement visibility."
	}
}

function statementOwner(
	status: ProviderFinanceStatementState
): "provider_finance" | "financial_operations" {
	return status === "blocked" ? "financial_operations" : "provider_finance"
}

export function buildProviderFinanceMaterialization(params: {
	providerId: string
	bookingRows: ProviderFinanceBookingSnapshotRow[]
	taxRows: ProviderFinanceTaxSnapshotRow[]
	commissionSnapshots: CommissionSnapshot[]
	payableSnapshots: ProviderPayableSnapshot[]
	statements: ProviderStatement[]
	reconciliationMatches: ReconciliationMatch[]
	settlementRecords: FinancialSettlementRecord[]
}): ProviderFinanceMaterialization {
	const groupedBookings = groupBy(params.bookingRows, (row) => String(row.bookingId))
	const taxByBooking = groupBy(params.taxRows, (row) => String(row.bookingId))
	const commissionByBooking = new Map(params.commissionSnapshots.map((row) => [row.bookingId, row]))
	const payableByBooking = new Map(params.payableSnapshots.map((row) => [row.bookingId, row]))
	const reconciliationByBooking = new Map(
		params.reconciliationMatches.map((row) => [row.bookingId, row])
	)
	const settlementByBooking = groupBy(params.settlementRecords, (row) => row.bookingId)

	const items = [...groupedBookings.entries()].map(([bookingId, rows]) => {
		const currency = firstCurrency(rows)
		const grossAmount = roundMoney(
			rows.reduce((sum, row) => sum + Number(row.detailTotalAmount ?? 0), 0)
		)
		const taxRows = taxByBooking.get(bookingId) ?? []
		const hasTaxSnapshot = taxRows.length > 0
		const taxSnapshotTotal = taxRows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)
		const detailTaxTotal = rows.reduce((sum, row) => sum + Number(row.detailTaxAmount ?? 0), 0)
		const taxAmount = roundMoney(hasTaxSnapshot ? taxSnapshotTotal : detailTaxTotal)
		const roomSnapshotCount = rows.filter((row) => row.detailId != null).length
		const contractFingerprint = stableFingerprint({
			bookingId,
			providerId: params.providerId,
			currency,
			grossAmount,
			taxAmount,
			roomSnapshotCount,
		})
		const commission = commissionByBooking.get(bookingId) ?? null
		const expectedCommission =
			commission == null ? null : roundMoney(grossAmount * Number(commission.commissionRate ?? 0))
		const commissionStaleReasons =
			commission == null
				? []
				: ([
						commission.currency !== currency ? "commission_currency_mismatch" : null,
						commission.basis !== "booking_room_detail_snapshot"
							? "commission_basis_mismatch"
							: null,
						expectedCommission !== roundMoney(commission.commissionAmount)
							? "commission_amount_stale"
							: null,
					].filter(Boolean) as string[])
		const commissionState: ProviderFinanceSnapshotState = commission
			? commissionStaleReasons.length
				? "stale"
				: "fresh"
			: "missing"
		const payable = payableByBooking.get(bookingId) ?? null
		const reconciliation = reconciliationByBooking.get(bookingId) ?? null
		const ready = reconciliationReady(reconciliation)
		const expectedNetPayable =
			expectedCommission == null ? null : roundMoney(grossAmount - expectedCommission - taxAmount)
		const payableBlocked = commission == null || !ready
		const payableStaleReasons =
			payable == null || payableBlocked || expectedNetPayable == null
				? []
				: ([
						payable.currency !== currency ? "payable_currency_mismatch" : null,
						roundMoney(payable.grossAmount) !== grossAmount ? "payable_gross_amount_stale" : null,
						roundMoney(payable.commissionAmount) !== roundMoney(Number(expectedCommission ?? 0))
							? "payable_commission_amount_stale"
							: null,
						roundMoney(payable.taxAmount) !== taxAmount ? "payable_tax_amount_stale" : null,
						roundMoney(payable.netPayable) !== expectedNetPayable
							? "payable_net_amount_stale"
							: null,
					].filter(Boolean) as string[])
		const payableState: ProviderFinanceSnapshotState = payableBlocked
			? "blocked"
			: payable
				? payableStaleReasons.length
					? "stale"
					: "fresh"
				: "missing"
		return {
			bookingId,
			providerId: params.providerId,
			currency,
			contract: {
				grossAmount,
				taxAmount,
				roomSnapshotCount,
				fingerprint: contractFingerprint,
			},
			commission: {
				state: commissionState,
				expectedAmount: expectedCommission,
				persistedAmount: commission?.commissionAmount ?? null,
				rate: commission?.commissionRate ?? null,
				fingerprint: commission
					? stableFingerprint({
							contractFingerprint,
							commissionRate: commission.commissionRate,
							expectedCommission,
						})
					: null,
				staleReasons: commissionStaleReasons,
			},
			payable: {
				state: payableState,
				expectedNetPayable,
				persistedNetPayable: payable?.netPayable ?? null,
				fingerprint:
					expectedNetPayable == null
						? null
						: stableFingerprint({
								contractFingerprint,
								commissionAmount: commission?.commissionAmount ?? null,
								expectedNetPayable,
							}),
				staleReasons: payableStaleReasons,
			},
			reconciliation: {
				ready,
				status: reconciliation?.status ?? "missing_reconciliation_match",
				reviewState: reconciliation?.reviewState ?? null,
			},
			settlement: {
				visible: (settlementByBooking.get(bookingId) ?? []).length > 0,
				count: (settlementByBooking.get(bookingId) ?? []).length,
			},
			explainability: {
				grossAmountSource: "BookingRoomDetail.totalAmount" as const,
				taxAmountSource: hasTaxSnapshot
					? ("BookingTaxFee.totalAmount" as const)
					: ("BookingRoomDetail.taxAmount" as const),
				commissionSource: commission
					? ("CommissionSnapshot" as const)
					: ("missing_commission_snapshot" as const),
				payableSource: payable
					? ("ProviderPayableSnapshot" as const)
					: ("pending_provider_payable_snapshot" as const),
				reconciliationSource: "ReconciliationMatch" as const,
			},
		}
	})

	const payableItems = items.filter((item) => item.payable.state === "fresh")
	const includedBookingIds = payableItems.map((item) => item.bookingId).sort()
	const excludedBookingIds = items
		.filter((item) => item.payable.state !== "fresh")
		.map((item) => item.bookingId)
		.sort()
	const currencies = [...new Set(payableItems.map((item) => item.currency))]
	const statement = latestStatement(params.statements)
	const taxSource = params.taxRows.length > 0 ? "BookingTaxFee" : "BookingRoomDetail"
	const draft = {
		providerId: params.providerId,
		currency: currencies.length === 1 ? currencies[0] : null,
		totalGrossAmount: roundMoney(
			payableItems.reduce((sum, item) => sum + item.contract.grossAmount, 0)
		),
		totalCommissionAmount: roundMoney(
			payableItems.reduce((sum, item) => sum + Number(item.commission.persistedAmount ?? 0), 0)
		),
		totalTaxAmount: roundMoney(
			payableItems.reduce((sum, item) => sum + item.contract.taxAmount, 0)
		),
		totalNetPayable: roundMoney(
			payableItems.reduce((sum, item) => sum + Number(item.payable.persistedNetPayable ?? 0), 0)
		),
		bookingCount: payableItems.length,
		basis: "provider_payable_snapshot_aggregation" as const,
		provenance: {
			aggregationSource: "ProviderPayableSnapshot" as const,
			contractSource: "BookingRoomDetail" as const,
			taxSource: taxSource as "BookingTaxFee" | "BookingRoomDetail",
			reconciliationSource: "ReconciliationMatch" as const,
			statementSource: "ProviderStatement" as const,
			includedBookingIds,
			excludedBookingIds,
		},
	}
	const staleReasons =
		statement == null
			? []
			: ([
					statement.currency !== draft.currency ? "statement_currency_mismatch" : null,
					roundMoney(statement.totalGrossAmount) !== draft.totalGrossAmount
						? "statement_gross_amount_stale"
						: null,
					roundMoney(statement.totalCommissionAmount) !== draft.totalCommissionAmount
						? "statement_commission_amount_stale"
						: null,
					roundMoney(statement.totalTaxAmount) !== draft.totalTaxAmount
						? "statement_tax_amount_stale"
						: null,
					roundMoney(statement.totalNetPayable) !== draft.totalNetPayable
						? "statement_net_payable_stale"
						: null,
				].filter(Boolean) as string[])
	const status: ProviderFinanceStatementState =
		currencies.length > 1 || items.some((item) => item.payable.state === "blocked")
			? "blocked"
			: statement
				? staleReasons.length
					? "stale"
					: "fresh"
				: "pending"
	const dependencyInvalidationReasons = [
		...new Set(
			items.flatMap((item) => [
				...item.commission.staleReasons,
				...item.payable.staleReasons,
				item.reconciliation.ready ? null : item.reconciliation.status,
				item.reconciliation.reviewState === "stale" ? "reconciliation_review_stale" : null,
			])
		),
	].filter((value): value is string => typeof value === "string" && value.length > 0)
	const invalidationReasons = [
		...new Set([
			...staleReasons,
			...dependencyInvalidationReasons,
			currencies.length > 1 ? "statement_currency_ambiguous" : null,
			items.some((item) => item.payable.state === "blocked") ? "payable_dependency_blocked" : null,
		]),
	].filter((value): value is string => typeof value === "string" && value.length > 0)
	const dependencies: ProviderFinanceStatementDependency[] = [
		{
			source: "BookingRoomDetail",
			state: items.length ? "fresh" : "missing",
			count: items.reduce((sum, item) => sum + item.contract.roomSnapshotCount, 0),
			staleReasons: [],
		},
		{
			source: taxSource,
			state: "fresh",
			count: params.taxRows.length,
			staleReasons: [],
		},
		{
			source: "CommissionSnapshot",
			state: items.some((item) => item.commission.state === "stale")
				? "stale"
				: items.some((item) => item.commission.state === "missing")
					? "missing"
					: "fresh",
			count: params.commissionSnapshots.length,
			staleReasons: [...new Set(items.flatMap((item) => item.commission.staleReasons))],
		},
		{
			source: "ProviderPayableSnapshot",
			state: items.some((item) => item.payable.state === "blocked")
				? "blocked"
				: items.some((item) => item.payable.state === "stale")
					? "stale"
					: items.some((item) => item.payable.state === "missing")
						? "missing"
						: "fresh",
			count: params.payableSnapshots.length,
			staleReasons: [...new Set(items.flatMap((item) => item.payable.staleReasons))],
		},
		{
			source: "ReconciliationMatch",
			state: items.some((item) => !item.reconciliation.ready) ? "blocked" : "fresh",
			count: params.reconciliationMatches.length,
			staleReasons: [
				...new Set(
					items.flatMap((item) =>
						item.reconciliation.ready
							? []
							: [item.reconciliation.status, item.reconciliation.reviewState].filter(
									(value): value is string => typeof value === "string" && value.length > 0
								)
					)
				),
			],
		},
		{
			source: "ProviderStatement",
			state: statement ? status : "missing",
			count: params.statements.length,
			staleReasons,
		},
	]

	return {
		providerId: params.providerId,
		items,
		statement: {
			...draft,
			status,
			freshness: status,
			lifecycle: {
				persistedStatementId: statement?.id ?? null,
				persistedStatementStatus: statement?.status ?? null,
				materializationState: status,
				invalidationReasons,
				owner: statementOwner(status),
				nextOperationalAction: statementAction(status),
			},
			fingerprint: stableFingerprint(draft),
			staleReasons,
			dependencies,
			nextOperationalAction: statementAction(status),
		},
	}
}
