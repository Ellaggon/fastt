import { expect, it } from "vitest"
import {
	areaDocumentGroups,
	caseVerificationArea,
	verificationAreas,
} from "@/lib/verification/areas"
import type { ProviderVerificationWorkspaceModel } from "@/lib/provider-verification-workspace"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"
const model = {
	navigation: { tabs: ["identity", "business", "fiscal"] },
	tourPlaybook: [
		{
			id: "identity",
			uiState: "requires_changes",
			stateLabel: "Requiere cambios",
			reason: "Corregir",
		},
	],
	trustLinks: [],
	kycSlots: [{ type: "government_id", documentId: "new" }],
} as unknown as ProviderVerificationWorkspaceModel
const documents = [
	{ id: "new", type: "government_id", status: "rejected", definitionVersionId: "v2" },
	{ id: "old", type: "government_id", status: "superseded", definitionVersionId: "v1" },
	{ id: "company", type: "business_registration", status: "verified" },
] as ProviderDocumentRecord[]
it("uses the provider areas and exact readiness rather than operational case domains", () => {
	const areas = verificationAreas(model)
	expect(areas.map((area) => area.label)).toEqual(["Identidad", "Negocio", "Datos fiscales"])
	expect(areas[0].stateLabel).toBe("Requiere cambios")
})
it("separates identity history across document definition versions and excludes business files", () => {
	const group = areaDocumentGroups(documents, "identity", model)
	expect(group.current.map((doc) => doc.id)).toEqual(["new"])
	expect(group.history.map((doc) => doc.id)).toEqual(["old"])
	expect(areaDocumentGroups(documents, "business", model).current.map((doc) => doc.id)).toEqual([
		"company",
	])
})
it("maps document cases to their functional area without rewriting persisted domains", () => {
	expect(
		caseVerificationArea(
			{ domain: "documents", sourceType: "ProviderDocument", sourceRef: "company" },
			documents
		)
	).toBe("business")
	expect(
		caseVerificationArea(
			{ domain: "documents", sourceType: "ProviderDocument", sourceRef: "new" },
			documents
		)
	).toBe("identity")
	expect(
		caseVerificationArea(
			{ domain: "documents", sourceType: "ProviderDocument", sourceRef: "unavailable" },
			documents
		)
	).toBeNull()
})
