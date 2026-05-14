import type {
	FinancialExceptionRepositoryPort,
	FinancialReviewEventRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"

export async function dismissFinancialException(
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
	const now = new Date()
	const exception = await deps.exceptions.resolve({
		id: input.exceptionId,
		providerId: input.providerId,
		resolvedAt: now,
		resolvedBy: input.actorId,
		resolutionNote: note,
		status: "dismissed",
	})
	if (!exception) return null
	const event = await deps.events.append({
		bookingId: exception.bookingId,
		providerId: exception.providerId,
		financialExceptionId: exception.id,
		type: "exception_dismissed",
		actorId: input.actorId,
		actorType: "operator",
		payloadJson: { resolutionNote: note },
	})
	return { exception, event }
}
