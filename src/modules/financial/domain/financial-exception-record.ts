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
	"multi_line_review",
] as const

export type FinancialExceptionCode = (typeof FINANCIAL_EXCEPTION_CODES)[number]

/** Lodging-specific codes persisted before the vertical-neutral vocabulary; read-time aliases only. */
const LEGACY_FINANCIAL_EXCEPTION_CODES: Record<string, FinancialExceptionCode> = {
	multi_room_review: "multi_line_review",
}

/**
 * Normalizes a persisted code to the canonical vocabulary. Legacy rows are read as their
 * neutral equivalent; a value outside the catalog is returned as-is for the caller to handle.
 */
export function normalizeFinancialExceptionCode(value: unknown): FinancialExceptionCode {
	const raw = String(value ?? "").trim()
	return LEGACY_FINANCIAL_EXCEPTION_CODES[raw] ?? (raw as FinancialExceptionCode)
}
export type FinancialExceptionSeverity = "review" | "attention"
export type FinancialExceptionBasis = "contract_snapshot" | "financial_evidence" | "refund_handoff"
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
