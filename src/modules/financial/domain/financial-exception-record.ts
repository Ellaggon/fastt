export const FINANCIAL_EXCEPTION_STATUSES = [
	"open",
	"acknowledged",
	"waiting_external",
	"resolved",
	"dismissed",
] as const

export type FinancialExceptionStatus = (typeof FINANCIAL_EXCEPTION_STATUSES)[number]

export const FINANCIAL_EXCEPTION_CODES = [
	"refund_handoff_required",
	"reconciliation_unknown",
	"missing_payment_reference",
	"missing_settlement_reference",
	"missing_refund_reference",
	"incomplete_contract_snapshot",
	"legacy_snapshot_compatibility",
	"multi_room_review",
] as const

export type FinancialExceptionCode = (typeof FINANCIAL_EXCEPTION_CODES)[number]
export type FinancialExceptionSeverity = "review" | "attention"
export type FinancialExceptionBasis =
	| "contract_snapshot"
	| "financial_evidence"
	| "refund_handoff"
	| "legacy_fallback"
export type FinancialNextOwner =
	| "financial_operations"
	| "reservations"
	| "provider_followup"
	| "external_finance"
	| "support"
	| "none"
export type FinancialExceptionSource =
	| "derived_queue"
	| "operator_review"
	| "refund_handoff"
	| "financial_evidence"

export type FinancialExceptionRecord = {
	id: string
	bookingId: string
	providerId: string
	code: FinancialExceptionCode
	severity: FinancialExceptionSeverity
	status: FinancialExceptionStatus
	basis: FinancialExceptionBasis
	reason: string
	nextOwner: FinancialNextOwner
	source: FinancialExceptionSource
	openedAt: Date
	acknowledgedAt?: Date | null
	resolvedAt?: Date | null
	resolvedBy?: string | null
	resolutionNote?: string | null
	createdAt: Date
	updatedAt: Date
}

export function isActiveFinancialExceptionStatus(status: FinancialExceptionStatus): boolean {
	return status === "open" || status === "acknowledged" || status === "waiting_external"
}
