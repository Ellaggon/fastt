import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it, beforeEach, afterEach, vi } from "vitest"
import ProviderAccountPolicyEvidence from "@/components/provider/ProviderAccountPolicyEvidence.astro"
import type { ProviderVerificationWorkspaceModel } from "@/lib/provider-verification-workspace"
import type { AccountPolicyEvidence } from "@/lib/commercial-policy/account-evidence"
beforeEach(() => vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "true"))
afterEach(() => vi.unstubAllEnvs())

const items: AccountPolicyEvidence[] = ["entity_existence", "entity_representation"].map(
	(key, i) => ({
		key: `national.entidad.${key}`,
		policyVersionId: "policy-a",
		productId: "tour-a",
		area: "business",
		label: i === 0 ? "Existencia de la entidad titular" : "Representación vigente de la entidad",
		state: "missing",
		stateLabel: "Requiere documentación",
		canUpload: true,
		documents: [],
		definitions: [
			{
				id: `definition-${i}`,
				key: `bo.holder.${key}`,
				family: "identity",
				label: key,
				capture: {
					version: 1,
					issuer: "required",
					issuedAt: "required",
					expiresAt: "optional",
					allowedSubjectTypes: ["legal_entity"],
					issuerCountries: [],
					requiredScopes: [],
				},
			},
		],
	})
)
const model = {
	providerId: "provider-a",
	holderType: "entidad",
	canManageDocuments: true,
	holderDeclarationInReview: false,
	accountPolicyEvidence: { items, unresolvedOffers: 0 },
} as ProviderVerificationWorkspaceModel

it("renders separate company requirements with provider-wide subjects and canonical policy proof", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(ProviderAccountPolicyEvidence, {
		request: new Request(
			"http://localhost:4321/provider/settings/verification?line=tour&tab=business"
		),
		props: { model, area: "business" },
	})
	expect(html).toContain("Existencia de la entidad titular")
	expect(html).toContain("Representación vigente de la entidad")
	expect(html).toContain('name="policyProductId"')
	expect(html).toContain('value="tour-a"')
	expect(html).toContain('name="subjectType" value="legal_entity"')
	expect(html).toContain('name="subjectReference" value="provider-a"')
	expect(html).not.toContain('name="scopeProductId"')
	expect(html).not.toContain('name="territoryCode"')
	expect(html).not.toContain("Enviar evidencia de esta experiencia")
	expect(html).toContain("Respaldos del titular")
	expect(html).not.toContain("data-optional-empty")
	expect(html).toContain("bg-amber-50")
	expect(html).toContain("bg-white")
})
it("does not offer uploads without document permission", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(ProviderAccountPolicyEvidence, {
		props: { model: { ...model, canManageDocuments: false }, area: "business" },
	})
	expect(html).toContain("Representación vigente de la entidad")
	expect(html).not.toContain("<form")
})
it("shows the fiscal backing separately from business requirements", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(ProviderAccountPolicyEvidence, {
		props: { model, area: "fiscal" },
	})
	expect(html).not.toContain("Existencia de la entidad titular")
})
