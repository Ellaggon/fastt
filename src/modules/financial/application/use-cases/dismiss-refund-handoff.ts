import type {
	FinancialReviewEventRepositoryPort,
	RefundHandoffRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"

export async function dismissRefundHandoff(
	deps: {
		handoffs: RefundHandoffRepositoryPort
		events: FinancialReviewEventRepositoryPort
	},
	input: {
		providerId: string
		refundHandoffId: string
		actorId?: string | null
		resolutionNote: string
	}
) {
	const resolutionNote = String(input.resolutionNote ?? "").trim()
	if (!resolutionNote) throw new Error("REFUND_HANDOFF_RESOLUTION_NOTE_REQUIRED")
	const handoff = await deps.handoffs.close({
		id: input.refundHandoffId,
		providerId: input.providerId,
		closedAt: new Date(),
		notes: resolutionNote,
		status: "dismissed",
	})
	if (!handoff) return null
	const event = await deps.events.append({
		bookingId: handoff.bookingId,
		providerId: handoff.providerId,
		refundHandoffId: handoff.id,
		type: "refund_handoff_dismissed",
		actorId: input.actorId ?? null,
		actorType: input.actorId ? "operator" : "system",
		payloadJson: {
			status: handoff.status,
			boundary: "operational_refund_review_only",
			resolutionNote,
		},
	})
	return { handoff, event }
}
