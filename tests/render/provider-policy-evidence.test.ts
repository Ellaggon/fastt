import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it, vi } from "vitest"
import Evidence from "@/components/provider/ProviderPolicyEvidence.astro"
import type { ProviderVerificationWorkspaceModel } from "@/lib/provider-verification-workspace"
vi.mock("@/lib/tours/operating-geography", () => ({ readOperatingPlaces: async () => [] }))
function model(state: "missing" | "pending_review" | null) {
	return {
		canManageDocuments: true,
		documents: [],
		tourResources: [],
		tourProducts: [{ id: "tour-a", name: "Experiencia" }],
		documentDefinitions: [
			{ id: "identity-v1", family: "government_id", label: "Identidad admitida" },
		],
		policyDiagnosis: {
			policyStatus: "supported",
			blockers: state
				? [{ id: "requirement_identity", policyVersionId: "policy-a", evidenceState: state }]
				: [],
			applicableRequirements: [
				{
					key: "identity",
					policyVersionId: "policy-a",
					blockingAction: "Acredita al titular.",
					condition: { evidenceSubjectSelector: "holder" },
					documentAcceptance: {
						version: 1,
						alternatives: [{ id: "first", allOf: [{ definitionVersionId: "identity-v1" }] }],
					},
				},
			],
		},
	} as unknown as ProviderVerificationWorkspaceModel
}
describe("provider versioned evidence", () => {
	it("offers upload tied to an exact policy and shows admitted documents", async () => {
		const html = await (
			await AstroContainer.create()
		).renderToString(Evidence, { props: { model: model("missing"), productId: "tour-a" } })
		expect(html).toContain("Identidad admitida")
		expect(html).toContain('name="policyRequirementKey" value="identity"')
		expect(html).toContain('name="policyVersionId" value="policy-a"')
		expect(html).toContain('name="definitionVersionId"')
	})
	it.each(["pending_review", null] as const)("does not request re-upload for %s", async (state) => {
		const html = await (
			await AstroContainer.create()
		).renderToString(Evidence, { props: { model: model(state), productId: "tour-a" } })
		expect(html).not.toContain("data-optional-upload-form")
		expect(html).toContain(state ? "En revisión" : "Documentación vigente")
	})
})
