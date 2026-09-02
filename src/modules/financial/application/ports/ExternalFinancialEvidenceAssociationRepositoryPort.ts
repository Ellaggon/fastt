export type ExternalFinancialEvidenceType = "payment" | "settlement"

export type AssociateExternalFinancialEvidenceInput = {
	providerId: string
	evidenceType: ExternalFinancialEvidenceType
	evidenceId: string
	bookingId: string
	actorId: string
	reason: string
}

export type ExternalFinancialEvidenceAssociationResult = {
	evidenceType: ExternalFinancialEvidenceType
	evidenceId: string
	bookingId: string
	eventId: string | null
	idempotent: boolean
}

export interface ExternalFinancialEvidenceAssociationRepositoryPort {
	associate(
		input: AssociateExternalFinancialEvidenceInput
	): Promise<ExternalFinancialEvidenceAssociationResult>
}
