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
		grossAmountSource: "BookingRoomDetail.totalPrice"
		taxAmountSource: "BookingTaxFee.totalAmount" | "BookingRoomDetail.taxes"
		commissionSource: "CommissionSnapshot" | "missing_commission_snapshot"
		payableSource: "ProviderPayableSnapshot" | "pending_provider_payable_snapshot"
		reconciliationSource: "ReconciliationMatch"
	}
}

export type ProviderFinanceStatementDraft = {
	providerId: string
	status: ProviderFinanceStatementState
	currency: string | null
	totalGrossAmount: number
	totalCommissionAmount: number
	totalTaxAmount: number
	totalNetPayable: number
	bookingCount: number
	fingerprint: string
	staleReasons: string[]
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

function stableFingerprint(value: Record<string, unknown>): string {
	const keys = Object.keys(value).sort()
	const raw = JSON.stringify(value, keys)
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
			rows.reduce((sum, row) => sum + Number(row.detailTotalPrice ?? 0), 0)
		)
		const taxRows = taxByBooking.get(bookingId) ?? []
		const hasTaxSnapshot = taxRows.length > 0
		const taxSnapshotTotal = taxRows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)
		const detailTaxTotal = rows.reduce((sum, row) => sum + Number(row.detailTaxes ?? 0), 0)
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
		const settlements = settlementByBooking.get(bookingId) ?? []
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
				visible: settlements.length > 0,
				count: settlements.length,
			},
			explainability: {
				grossAmountSource: "BookingRoomDetail.totalPrice" as const,
				taxAmountSource: hasTaxSnapshot
					? ("BookingTaxFee.totalAmount" as const)
					: ("BookingRoomDetail.taxes" as const),
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
	const currencies = [...new Set(payableItems.map((item) => item.currency))]
	const statement = latestStatement(params.statements)
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

	return {
		providerId: params.providerId,
		items,
		statement: {
			...draft,
			status,
			fingerprint: stableFingerprint(draft),
			staleReasons,
		},
	}
}
