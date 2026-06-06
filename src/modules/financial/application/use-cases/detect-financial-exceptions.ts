import type {
	FinancialExceptionBasis,
	FinancialExceptionCode,
	FinancialExceptionSeverity,
	FinancialNextOwner,
} from "../../domain/financial-exception-record"

export type DetectedFinancialException = {
	bookingId: string
	providerId: string
	code: FinancialExceptionCode
	severity: FinancialExceptionSeverity
	basis: FinancialExceptionBasis
	reason: string
	nextOwner: FinancialNextOwner
	source: "derived_queue"
}

export type DetectFinancialExceptionsInput = {
	bookingId: string
	providerId: string
	evidenceAlignmentState: string
	financialEvidence: { refundEvidence?: string; settlementEvidence?: string }
	paymentIntentCount: number
	settlementRecordCount: number
	hasPaymentReference: boolean
	hasSettlementReference: boolean
	hasRefundReference: boolean
	hasRoomSnapshots: boolean
	hasTaxFeeSnapshots: boolean
	taxesTotal: number
	multiRoomAllocationCount: number
	snapshotVersion: string
}

export function detectFinancialExceptions(
	input: DetectFinancialExceptionsInput
): DetectedFinancialException[] {
	const exceptions: DetectedFinancialException[] = []
	const base = {
		bookingId: input.bookingId,
		providerId: input.providerId,
		source: "derived_queue" as const,
	}

	if (input.evidenceAlignmentState === "handoff_pending") {
		exceptions.push({
			...base,
			code: "refund_handoff_required",
			severity: "attention",
			reason:
				"Cancelled reservation has refund handoff visibility but no refund evidence recorded.",
			nextOwner: "financial_operations",
			basis: "refund_handoff",
		})
	}
	if (input.evidenceAlignmentState === "evidence_unknown") {
		exceptions.push({
			...base,
			code: "reconciliation_unknown",
			severity: "attention",
			reason: "Financial evidence exists but does not provide enough alignment for the contract.",
			nextOwner: "financial_operations",
			basis: "financial_evidence",
		})
	}
	if (input.paymentIntentCount > 0 && !input.hasPaymentReference) {
		exceptions.push({
			...base,
			code: "missing_payment_reference",
			severity: "attention",
			reason: "Payment evidence is visible but no stable transaction reference was captured.",
			nextOwner: "external_finance",
			basis: "financial_evidence",
		})
	}
	if (input.settlementRecordCount > 0 && !input.hasSettlementReference) {
		exceptions.push({
			...base,
			code: "missing_settlement_reference",
			severity: "attention",
			reason: "Settlement visibility exists without a stable settlement reference.",
			nextOwner: "external_finance",
			basis: "financial_evidence",
		})
	}
	if (
		input.financialEvidence.refundEvidence === "refund_handoff_required" &&
		!input.hasRefundReference
	) {
		exceptions.push({
			...base,
			code: "missing_refund_reference",
			severity: "attention",
			reason: "Refund handoff is required but no refund reference is available yet.",
			nextOwner: "financial_operations",
			basis: "refund_handoff",
		})
	}
	if (!input.hasRoomSnapshots || (input.taxesTotal > 0 && !input.hasTaxFeeSnapshots)) {
		exceptions.push({
			...base,
			code: "incomplete_contract_snapshot",
			severity: "attention",
			reason: "Contract audit evidence is incomplete for room or tax/fee snapshots.",
			nextOwner: "reservations",
			basis: "contract_snapshot",
		})
	}
	if (input.multiRoomAllocationCount > 1) {
		exceptions.push({
			...base,
			code: "multi_room_review",
			severity: "review",
			reason:
				"Multi-room contract: totals are aggregated from room snapshots and should be reviewed as a group.",
			nextOwner: "financial_operations",
			basis: "contract_snapshot",
		})
	}
	return exceptions
}
