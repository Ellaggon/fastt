import type {
	FinancialReviewEventRepositoryPort,
	RefundHandoffRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"

export async function acknowledgeRefundHandoff(
	deps: {
		handoffs: RefundHandoffRepositoryPort
		events: FinancialReviewEventRepositoryPort
	},
	input: { providerId: string; refundHandoffId: string; actorId?: string | null }
) {
	const existing = await deps.handoffs.findByIdForProvider(input.refundHandoffId, input.providerId)
	if (!existing) return null
	if (existing.status === "acknowledged") {
		return { handoff: existing, event: null, idempotent: true }
	}
	const handoff = await deps.handoffs.acknowledge({
		id: input.refundHandoffId,
		providerId: input.providerId,
		acknowledgedAt: new Date(),
	})
	if (!handoff) return null
	const event = await deps.events.append({
		bookingId: handoff.bookingId,
		providerId: handoff.providerId,
		refundHandoffId: handoff.id,
		type: "refund_handoff_acknowledged",
		actorId: input.actorId ?? null,
		actorType: input.actorId ? "operator" : "system",
		payloadJson: { status: handoff.status, boundary: "handoff_visibility_only" },
	})
	return { handoff, event }
}
