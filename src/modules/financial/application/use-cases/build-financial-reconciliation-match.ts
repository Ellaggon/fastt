import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { FinancialReference } from "../../domain/financial-reference"
import type { PaymentTransaction } from "../../domain/payment-transaction"
import type { ReconciliationMatchStatus } from "../../domain/reconciliation-match"
import type {
	FinancialOperationBookingRow,
	FinancialShadowEvidenceRow,
	BookingTaxFeeSnapshotRow,
} from "./build-financial-operation-review"
import {
	buildFinancialOperationReview,
	readFinancialShadowAmount,
	readFinancialShadowReference,
} from "./build-financial-operation-review"

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
	basis: "booking_snapshot_payment_transaction_settlement_evidence"
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
		shadowCompatibilityReferences: string[]
	}
	settlement: {
		amount: number | null
		currency: string | null
		records: FinancialSettlementRecord[]
		shadowCompatibilityReferences: string[]
	}
	references: FinancialReference[]
	reviewStatus?: "unreviewed" | "reviewed" | null
	reviewedAt?: Date | null
	reviewedBy?: string | null
	reviewNote?: string | null
	queues: Array<"missing_payment" | "missing_settlement" | "mismatch" | "currency_mismatch">
	compatibility: {
		usesFinancialShadowEvidence: boolean
		shadowPaymentAmount: number | null
		shadowSettlementAmount: number | null
	}
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
	shadowRows: FinancialShadowEvidenceRow[]
	taxRows: BookingTaxFeeSnapshotRow[]
	providerId: string
	paymentTransactions: PaymentTransaction[]
	settlementRecords: FinancialSettlementRecord[]
	references: FinancialReference[]
}): FinancialReconciliationMatchDraft {
	const review = buildFinancialOperationReview({
		group: params.group,
		shadowRows: params.shadowRows,
		taxRows: params.taxRows,
		providerId: params.providerId,
	})
	const paymentTransactions = nonTerminalPaymentTransactions(params.paymentTransactions)
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
	const shadowPaymentRows = params.shadowRows.filter((row) => row.type === "payment_intent")
	const shadowSettlementRows = params.shadowRows.filter((row) => row.type === "settlement_record")
	const shadowPaymentAmount = sumAmounts(
		shadowPaymentRows
			.map((row) => ({ amount: readFinancialShadowAmount(row.payload) ?? Number.NaN }))
			.filter((row) => Number.isFinite(row.amount))
	)
	const shadowSettlementAmount = sumAmounts(
		shadowSettlementRows
			.map((row) => ({ amount: readFinancialShadowAmount(row.payload) ?? Number.NaN }))
			.filter((row) => Number.isFinite(row.amount))
	)
	const queues: FinancialReconciliationMatchDraft["queues"] = []
	if (status === "missing_payment") queues.push("missing_payment")
	if (status === "missing_settlement") queues.push("missing_settlement")
	if (status === "mismatch") queues.push("mismatch")
	if (status === "currency_mismatch") queues.push("currency_mismatch")

	return {
		id: `recon:${review.bookingId}`,
		bookingId: review.bookingId,
		providerId: String(params.group[0]?.providerIdSnapshot ?? params.providerId),
		contractAmount: review.contractTotal,
		paymentAmount,
		settlementAmount,
		differenceAmount,
		status,
		basis: "booking_snapshot_payment_transaction_settlement_evidence",
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
			shadowCompatibilityReferences: shadowPaymentRows
				.map((row) => readFinancialShadowReference(row.payload))
				.filter(Boolean) as string[],
		},
		settlement: {
			amount: settlementAmount,
			currency: settlementCurrency,
			records: params.settlementRecords,
			shadowCompatibilityReferences: shadowSettlementRows
				.map((row) => readFinancialShadowReference(row.payload))
				.filter(Boolean) as string[],
		},
		references: params.references,
		queues,
		compatibility: {
			usesFinancialShadowEvidence: shadowPaymentRows.length > 0 || shadowSettlementRows.length > 0,
			shadowPaymentAmount,
			shadowSettlementAmount,
		},
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
