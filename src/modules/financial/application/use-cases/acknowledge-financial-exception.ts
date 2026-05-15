import type {
	FinancialExceptionRepositoryPort,
	FinancialReviewEventRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"

export async function acknowledgeFinancialException(
	deps: {
		exceptions: FinancialExceptionRepositoryPort
		events: FinancialReviewEventRepositoryPort
	},
	input: { providerId: string; exceptionId: string; actorId?: string | null }
) {
	const existing = await deps.exceptions.findByIdForProvider(input.exceptionId, input.providerId)
	if (!existing) return null
	if (existing.status === "acknowledged") {
		return { exception: existing, event: null, idempotent: true }
	}
	const now = new Date()
	const exception = await deps.exceptions.acknowledge({
		id: input.exceptionId,
		providerId: input.providerId,
		acknowledgedAt: now,
	})
	if (!exception) return null
	const event = await deps.events.append({
		bookingId: exception.bookingId,
		providerId: exception.providerId,
		financialExceptionId: exception.id,
		type: "exception_acknowledged",
		actorId: input.actorId ?? null,
		actorType: input.actorId ? "operator" : "system",
		payloadJson: { status: exception.status },
	})
	return { exception, event }
}
