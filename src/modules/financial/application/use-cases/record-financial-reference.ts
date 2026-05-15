import type {
	FinancialReferenceRepositoryPort,
	FinancialReviewEventRepositoryPort,
} from "../ports/FinancialWorkflowRepositoryPort"
import type {
	FinancialReferenceBasis,
	FinancialReferenceSource,
	FinancialReferenceType,
} from "../../domain/financial-reference"

export async function recordFinancialReference(
	deps: {
		references: FinancialReferenceRepositoryPort
		events: FinancialReviewEventRepositoryPort
	},
	input: {
		bookingId: string
		providerId: string
		type: FinancialReferenceType
		referenceValue: string
		externalSystem?: string | null
		amount?: number | null
		currency?: string | null
		recordedAt?: Date | null
		source: FinancialReferenceSource
		basis: FinancialReferenceBasis
		linkedExceptionId?: string | null
		actorId?: string | null
		note?: string | null
	}
) {
	const referenceValue = String(input.referenceValue ?? "").trim()
	if (!referenceValue) throw new Error("FINANCIAL_REFERENCE_VALUE_REQUIRED")
	const result = await deps.references.createIfAbsent({
		bookingId: input.bookingId,
		providerId: input.providerId,
		type: input.type,
		referenceValue,
		externalSystem: input.externalSystem ?? null,
		amount: input.amount ?? null,
		currency: input.currency ?? null,
		recordedAt: input.recordedAt ?? new Date(),
		source: input.source,
		basis: input.basis,
	})
	const event = result.created
		? await deps.events.append({
				bookingId: input.bookingId,
				providerId: input.providerId,
				financialExceptionId: input.linkedExceptionId ?? null,
				financialReferenceId: result.reference.id,
				type: "reference_added",
				actorId: input.actorId ?? null,
				actorType: input.actorId ? "operator" : "system",
				payloadJson: {
					referenceType: input.type,
					externalSystem: input.externalSystem ?? null,
					linkedExceptionId: input.linkedExceptionId ?? null,
					note: input.note ?? null,
				},
			})
		: null
	return { reference: result.reference, created: result.created, event }
}
