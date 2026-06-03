import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { FinancialReference } from "../../domain/financial-reference"
import type { PaymentTransaction } from "../../domain/payment-transaction"
import type {
	ReconciliationMatchStatus,
	ReconciliationMismatchReason,
	ReconciliationReviewState,
} from "../../domain/reconciliation-match"
import type {
	FinancialOperationBookingRow,
	FinancialEvidenceRow,
	BookingTaxFeeSnapshotRow,
} from "./build-financial-operation-review"
import { buildFinancialOperationReview } from "./build-financial-operation-review"

export type DuplicateExternalReferenceSignal = {
	code: "duplicate_external_reference"
	providerId: string
	pspProvider: string
	externalReference: string
	bookingIds: string[]
	count: number
	reason: string
}

export type FinancialReconciliationMatchDraft = {
	id: string
	bookingId: string
	providerId: string
	contractAmount: number
	paymentAmount: number | null
	settlementAmount: number | null
	differenceAmount: number
	status: ReconciliationMatchStatus
	mismatchReasons: ReconciliationMismatchReason[]
	basis: "booking_snapshot_payment_transaction_settlement_evidence"
	comparisonFingerprint: string
	currency: string
	contract: {
		amount: number
		currency: string
		multiRoomAllocationCount: number
		taxFeeSnapshotLines: number
	}
	payment: {
		amount: number | null
		currency: string | null
		transactions: PaymentTransaction[]
	}
	settlement: {
		amount: number | null
		currency: string | null
		records: FinancialSettlementRecord[]
	}
	references: FinancialReference[]
	reviewStatus?: "unreviewed" | "reviewed" | null
	reviewState?: ReconciliationReviewState | null
	reviewFingerprint?: string | null
	reviewedAt?: Date | null
	reviewedBy?: string | null
	reviewNote?: string | null
	queues: Array<
		| "missing_payment"
		| "missing_settlement"
		| "mismatch"
		| "currency_mismatch"
		| "missing_capture_reference"
		| "refund_without_matching_cancellation"
	>
}

function roundMoney(value: number): number {
	return Number(value.toFixed(2))
}

function sumAmounts(rows: Array<{ amount: number }>): number | null {
	if (!rows.length) return null
	return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))
}

function firstCurrency(rows: Array<{ currency: string }>): string | null {
	const value = rows
		.map((row) =>
			String(row.currency ?? "")
				.trim()
				.toUpperCase()
		)
		.find(Boolean)
	return value || null
}

function nonTerminalPaymentTransactions(rows: PaymentTransaction[]): PaymentTransaction[] {
	return rows.filter((row) => row.status !== "failed" && row.status !== "cancelled")
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`
	}
	return JSON.stringify(value)
}

export function buildFinancialReconciliationFingerprint(params: {
	bookingId: string
	contractAmount: number
	currency: string
	paymentTransactions: PaymentTransaction[]
	settlementRecords: FinancialSettlementRecord[]
}): string {
	const payment = params.paymentTransactions
		.map((row) => ({
			type: row.type,
			status: row.status,
			amount: row.amount,
			currency: row.currency,
			externalReference: row.externalReference,
			pspProvider: row.pspProvider,
			occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt),
		}))
		.sort((a, b) =>
			`${a.pspProvider}:${a.externalReference}:${a.type}`.localeCompare(
				`${b.pspProvider}:${b.externalReference}:${b.type}`
			)
		)
	const settlement = params.settlementRecords
		.map((row) => ({
			amount: row.amount,
			currency: row.currency,
			settlementReference: row.settlementReference,
			settlementDate: row.settlementDate?.toISOString?.() ?? String(row.settlementDate),
		}))
		.sort((a, b) => a.settlementReference.localeCompare(b.settlementReference))
	return stableJson({
		bookingId: params.bookingId,
		contractAmount: roundMoney(params.contractAmount),
		currency: params.currency,
		payment,
		settlement,
	})
}

function difference(
	contractAmount: number,
	paymentAmount: number | null,
	settlementAmount: number | null
): number {
	const paymentDiff = paymentAmount == null ? 0 : Math.abs(contractAmount - paymentAmount)
	const settlementDiff = settlementAmount == null ? 0 : Math.abs(contractAmount - settlementAmount)
	return roundMoney(Math.max(paymentDiff, settlementDiff))
}

function deriveStatus(params: {
	contractCurrency: string
	paymentCurrency: string | null
	settlementCurrency: string | null
	paymentAmount: number | null
	settlementAmount: number | null
	differenceAmount: number
}): ReconciliationMatchStatus {
	if (params.paymentAmount == null) return "missing_payment"
	if (params.settlementAmount == null) return "missing_settlement"
	if (
		(params.paymentCurrency && params.paymentCurrency !== params.contractCurrency) ||
		(params.settlementCurrency && params.settlementCurrency !== params.contractCurrency)
	) {
		return "currency_mismatch"
	}
	return params.differenceAmount > 0.01 ? "mismatch" : "matched"
}

export function buildFinancialReconciliationMatch(params: {
	group: FinancialOperationBookingRow[]
	financialEvidenceRows: FinancialEvidenceRow[]
	taxRows: BookingTaxFeeSnapshotRow[]
	providerId: string
	paymentTransactions: PaymentTransaction[]
	settlementRecords: FinancialSettlementRecord[]
	references: FinancialReference[]
}): FinancialReconciliationMatchDraft {
	const review = buildFinancialOperationReview({
		group: params.group,
		financialEvidenceRows: params.financialEvidenceRows,
		taxRows: params.taxRows,
		providerId: params.providerId,
	})
	const paymentTransactions = nonTerminalPaymentTransactions(params.paymentTransactions)
	const hasIntentOrAuthorization = paymentTransactions.some(
		(row) => row.type === "intent" || row.type === "authorization"
	)
	const hasCapture = paymentTransactions.some((row) => row.type === "capture")
	const hasRefundTransaction = paymentTransactions.some((row) => row.type === "refund")
	const paymentAmount = sumAmounts(
		paymentTransactions.filter((row) => row.type !== "refund" && row.type !== "void")
	)
	const settlementAmount = sumAmounts(params.settlementRecords)
	const paymentCurrency = firstCurrency(paymentTransactions)
	const settlementCurrency = firstCurrency(params.settlementRecords)
	const differenceAmount = difference(review.contractTotal, paymentAmount, settlementAmount)
	const status = deriveStatus({
		contractCurrency: review.currency,
		paymentCurrency,
		settlementCurrency,
		paymentAmount,
		settlementAmount,
		differenceAmount,
	})
	const queues: FinancialReconciliationMatchDraft["queues"] = []
	const mismatchReasons: ReconciliationMismatchReason[] = []
	if (
		paymentAmount != null &&
		paymentCurrency === review.currency &&
		Math.abs(review.contractTotal - paymentAmount) > 0.01
	) {
		mismatchReasons.push("payment_amount_mismatch")
	}
	if (
		settlementAmount != null &&
		settlementCurrency === review.currency &&
		Math.abs(review.contractTotal - settlementAmount) > 0.01
	) {
		mismatchReasons.push("settlement_amount_mismatch")
	}
	if (hasIntentOrAuthorization && !hasCapture) {
		mismatchReasons.push("missing_capture_reference")
	}
	if (
		hasRefundTransaction &&
		review.status.toLowerCase() !== "cancelled" &&
		review.refund.state !== "refund_handoff_required" &&
		review.refund.state !== "refund_evidence_visible"
	) {
		mismatchReasons.push("refund_without_matching_cancellation")
	}
	if (status === "missing_payment") queues.push("missing_payment")
	if (status === "missing_settlement") queues.push("missing_settlement")
	if (status === "mismatch") queues.push("mismatch")
	if (status === "currency_mismatch") queues.push("currency_mismatch")
	if (mismatchReasons.includes("missing_capture_reference"))
		queues.push("missing_capture_reference")
	if (mismatchReasons.includes("refund_without_matching_cancellation")) {
		queues.push("refund_without_matching_cancellation")
	}
	const comparisonFingerprint = buildFinancialReconciliationFingerprint({
		bookingId: review.bookingId,
		contractAmount: review.contractTotal,
		currency: review.currency,
		paymentTransactions,
		settlementRecords: params.settlementRecords,
	})

	return {
		id: `recon:${review.bookingId}`,
		bookingId: review.bookingId,
		providerId: String(params.group[0]?.providerIdSnapshot ?? params.providerId),
		contractAmount: review.contractTotal,
		paymentAmount,
		settlementAmount,
		differenceAmount,
		status,
		mismatchReasons,
		basis: "booking_snapshot_payment_transaction_settlement_evidence",
		comparisonFingerprint,
		currency: review.currency,
		contract: {
			amount: review.contractTotal,
			currency: review.currency,
			multiRoomAllocationCount: review.snapshotIntegrity.multiRoomAllocationCount,
			taxFeeSnapshotLines: review.taxFeeVisibility.lines,
		},
		payment: {
			amount: paymentAmount,
			currency: paymentCurrency,
			transactions: paymentTransactions,
		},
		settlement: {
			amount: settlementAmount,
			currency: settlementCurrency,
			records: params.settlementRecords,
		},
		references: params.references,
		queues,
	}
}

export function buildDuplicateExternalReferenceSignals(params: {
	providerId: string
	duplicates: Array<{
		pspProvider: string
		externalReference: string
		count: number
		bookingIds: string[]
	}>
}): DuplicateExternalReferenceSignal[] {
	return params.duplicates.map((entry) => ({
		code: "duplicate_external_reference",
		providerId: params.providerId,
		pspProvider: entry.pspProvider,
		externalReference: entry.externalReference,
		bookingIds: entry.bookingIds,
		count: entry.count,
		reason: "The same PSP external reference is visible on more than one payment transaction.",
	}))
}
