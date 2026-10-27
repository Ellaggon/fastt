import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Business from "@/components/provider/ProviderTourBusinessVerification.astro"
import { buildRequiredKycSlots } from "@/lib/provider-documents"

const model = {
	businessProfile: { displayName: "Paseos", legalName: "Operador", holderCountry: "BO" },
	holderType: "persona_natural",
	holderDeclarationInReview: false,
	latestVerification: { status: "approved" },
	canEditTourContext: true,
	canManageDocuments: true,
	kycSlots: [],
	documentAssignments: {},
	screen: null,
	historicalBusinessRegistrationDocuments: [],
}

it("shows an independent operator without a company-document form", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Business, { props: { model } })
	expect(html).toContain("Persona natural")
	expect(html).toContain("Bolivia")
	expect(html).toContain("No necesitas presentar un registro de empresa")
	expect(html).toContain("Editar datos del negocio")
	expect(html).not.toContain("data-kyc-slots")
})

it("renders the entity registration and respects edit permissions", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Business, {
		props: {
			model: {
				...model,
				holderType: "entidad",
				canEditTourContext: false,
				canManageDocuments: false,
				kycSlots: buildRequiredKycSlots({ documents: [], types: ["business_registration"] }),
			},
		},
	})
	expect(html).toContain("business_registration")
	expect(html).not.toContain("government_id")
	expect(html).not.toContain("Editar datos del negocio")
	expect(html).not.toContain('action="/api/provider/settings/documents"')
})

it("shows account review without inventing completed requirements", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Business, {
		props: {
			model: {
				...model,
				holderType: "entidad",
				latestVerification: { status: "pending" },
			},
		},
	})
	expect(html).toContain("Negocio en revisión")
	expect(html).toContain("Requisitos del registro por definir")
	expect(html).not.toContain("No necesitas presentar")
})
