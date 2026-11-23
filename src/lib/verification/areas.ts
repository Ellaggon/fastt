import type { ProviderVerificationWorkspaceModel } from "@/lib/provider-verification-workspace"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"
import { verificationTabLabel, type VerificationTab } from "./navigation"

/** Public functional areas; casework domains remain internal routing keys. */
export function verificationAreas(model: ProviderVerificationWorkspaceModel) {
	const tabs = model.navigation?.tabs ?? ["identity", "business", "fiscal", "payments"]
	return tabs.map((id) => {
		const state =
			model.tourPlaybook.find((area) => area.id === id) ??
			model.trustLinks.find((area) => area.id === id)
		return {
			id,
			label: verificationTabLabel(id),
			stateLabel: state?.stateLabel ?? "Sin evaluar",
			uiState: state?.uiState ?? "not_started",
			reason:
				state && "reason" in state
					? state.reason
					: state && "description" in state
						? state.description
						: "",
		}
	})
}
export function documentVerificationArea(
	doc: Pick<ProviderDocumentRecord, "type" | "id">,
	model?: ProviderVerificationWorkspaceModel
): VerificationTab | null {
	if (doc.type === "government_id") return "identity"
	if (doc.type === "business_registration") return "business"
	if (doc.type === "tax_document") return "fiscal"
	return (
		model?.accountPolicyEvidence?.items.find((item) => item.documents.some((d) => d.id === doc.id))
			?.area ?? null
	)
}
export function areaDocumentGroups(
	documents: ProviderDocumentRecord[],
	area: VerificationTab,
	model: ProviderVerificationWorkspaceModel
) {
	const matching = documents.filter((doc) => documentVerificationArea(doc, model) === area)
	const selectedIds = new Set(model.kycSlots.map((slot) => slot.documentId).filter(Boolean))
	const groups = new Map<string, ProviderDocumentRecord[]>()
	for (const doc of matching) {
		const key = ["government_id", "business_registration", "tax_document"].includes(doc.type)
			? doc.type
			: `${doc.definitionVersionId ?? doc.type}:${doc.subjectType ?? ""}:${doc.subjectReference ?? ""}`
		const group = groups.get(key) ?? []
		group.push(doc)
		groups.set(key, group)
	}
	const current = [...groups.values()].flatMap((group) => {
		const selected =
			group.find((doc) => selectedIds.has(doc.id)) ??
			group.find((doc) => doc.status !== "superseded")
		return selected ? [selected] : []
	})
	const currentIds = new Set(current.map((doc) => doc.id))
	return { current, history: matching.filter((doc) => !currentIds.has(doc.id)) }
}
export function caseVerificationArea(
	item: { domain: string; sourceType: string; sourceRef: string },
	documents: ProviderDocumentRecord[],
	model?: ProviderVerificationWorkspaceModel
): VerificationTab | null {
	if (item.sourceType === "ProviderDocument") {
		const doc = documents.find((doc) => doc.id === item.sourceRef)
		return doc ? documentVerificationArea(doc, model) : null
	}
	if (item.domain === "verification") return "business"
	if (item.domain === "fiscal") return "fiscal"
	if (item.domain === "payments") return "payments"
	return null
}
