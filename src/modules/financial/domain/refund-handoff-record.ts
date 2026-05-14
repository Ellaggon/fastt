export const REFUND_HANDOFF_STATUSES = [
	"required",
	"acknowledged",
	"waiting_external",
	"evidence_recorded",
	"closed",
	"dismissed",
] as const

export type RefundHandoffStatus = (typeof REFUND_HANDOFF_STATUSES)[number]
export type RefundHandoffReason =
	| "cancellation"
	| "modification"
	| "goodwill"
	| "provider_issue"
	| "unknown"
export type RefundHandoffType = "full" | "partial" | "unknown"
export type RefundHandoffBasis =
	| "booking_cancelled"
	| "reservation_modification"
	| "operator_review"
export type RefundHandoffOwner =
	| "financial_operations"
	| "external_finance"
	| "provider_followup"
	| "support"
	| "none"

export type RefundHandoffRecord = {
	id: string
	bookingId: string
	providerId: string
	status: RefundHandoffStatus
	reason: RefundHandoffReason
	refundType: RefundHandoffType
	expectedAmount?: number | null
	currency?: string | null
	basis: RefundHandoffBasis
	nextOwner: RefundHandoffOwner
	openedAt: Date
	acknowledgedAt?: Date | null
	closedAt?: Date | null
	notes?: string | null
	createdAt: Date
	updatedAt: Date
}
