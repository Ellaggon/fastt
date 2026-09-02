import type {
	AssociateExternalFinancialEvidenceInput,
	ExternalFinancialEvidenceAssociationRepositoryPort,
} from "../ports/ExternalFinancialEvidenceAssociationRepositoryPort"

export async function associateExternalFinancialEvidence(
	deps: { repository: ExternalFinancialEvidenceAssociationRepositoryPort },
	input: AssociateExternalFinancialEvidenceInput
) {
	const normalized = {
		providerId: String(input.providerId || "").trim(),
		evidenceType: input.evidenceType,
		evidenceId: String(input.evidenceId || "").trim(),
		bookingId: String(input.bookingId || "").trim(),
		actorId: String(input.actorId || "").trim(),
		reason: String(input.reason || "").trim(),
	}
	if (!normalized.providerId || !normalized.evidenceId || !normalized.bookingId) {
		throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_INPUT_REQUIRED")
	}
	if (!normalized.actorId) throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_ACTOR_REQUIRED")
	if (!normalized.reason) throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_REASON_REQUIRED")
	if (normalized.reason.length > 1000) {
		throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_REASON_TOO_LONG")
	}
	if (normalized.evidenceType !== "payment" && normalized.evidenceType !== "settlement") {
		throw new Error("FINANCIAL_EVIDENCE_TYPE_UNSUPPORTED")
	}
	return deps.repository.associate(normalized)
}
