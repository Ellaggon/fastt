export const FINANCIAL_REVIEW_EVENT_TYPES = [
	"exception_opened",
	"exception_acknowledged",
	"exception_resolved",
	"exception_dismissed",
	"owner_changed",
	"reference_added",
	"refund_handoff_opened",
	"refund_handoff_acknowledged",
	"refund_handoff_closed",
	"refund_handoff_dismissed",
	"note_added",
] as const

export type FinancialReviewEventType = (typeof FINANCIAL_REVIEW_EVENT_TYPES)[number]
export type FinancialReviewActorType = "system" | "operator"

export type FinancialReviewEvent = {
	id: string
	bookingId: string
	providerId: string
	financialExceptionId?: string | null
	financialReferenceId?: string | null
	refundHandoffId?: string | null
	type: FinancialReviewEventType
	actorId?: string | null
	actorType: FinancialReviewActorType
	payloadJson?: Record<string, unknown> | null
	createdAt: Date
}
