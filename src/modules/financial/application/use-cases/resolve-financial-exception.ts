import type {
	FinancialExceptionRepositoryPort,
	FinancialReviewEventRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"

export async function resolveFinancialException(
	deps: {
		exceptions: FinancialExceptionRepositoryPort
		events: FinancialReviewEventRepositoryPort
	},
	input: {
		providerId: string
		exceptionId: string
		actorId: string
		resolutionNote: string
	}
) {
	const note = String(input.resolutionNote ?? "").trim()
	if (!note) throw new Error("FINANCIAL_RESOLUTION_NOTE_REQUIRED")
	const existing = await deps.exceptions.findByIdForProvider(input.exceptionId, input.providerId)
	if (!existing) return null
	if (existing.status === "resolved") {
		return { exception: existing, event: null, idempotent: true }
	}
	if (existing.status === "dismissed") return null
	const now = new Date()
	const exception = await deps.exceptions.resolve({
		id: input.exceptionId,
		providerId: input.providerId,
		resolvedAt: now,
		resolvedBy: input.actorId,
		resolutionNote: note,
		status: "resolved",
	})
	if (!exception) return null
	const event = await deps.events.append({
		bookingId: exception.bookingId,
		providerId: exception.providerId,
		financialExceptionId: exception.id,
		type: "exception_resolved",
		actorId: input.actorId,
		actorType: "operator",
		payloadJson: { resolutionNote: note, reviewStatus: "operational_review_closed_only" },
	})
	return { exception, event }
}
