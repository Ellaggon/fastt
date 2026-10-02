import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Evidence from "@/components/provider/ProviderVerificationOptionals.astro"
import { presentExperienceDocument } from "@/lib/verification/document-list-presentation"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"
import type { VerificationRequirement } from "@/lib/verification/requirement-resolver"
it("renders approval separately from unresolved applicability without anonymous scope labels", async () => {
	const doc = {
		providerId: "p",
		fileUrl: null,
		mimeType: null,
		sizeBytes: null,
		submissionNotes: null,
		issuer: null,
		issuedAt: null,
		reviewNotes: null,
		reviewedAt: null,
		reviewedBy: null,
		createdAt: null,
		updatedAt: null,
		id: "d",
		type: "operating_license",
		typeLabel: "Licencia",
		status: "verified",
		statusLabel: "Verificado",
		tone: "success",
		expiresAt: null,
		subjectType: "provider",
		subjectReference: null,
		scopes: [],
		fileName: "licencia.pdf",
	} as ProviderDocumentRecord
	const presentation = presentExperienceDocument({
		document: doc,
		requirements: [
			{
				id: "tour.operator_license",
				layer: "tour",
				documentType: "operating_license",
			} as VerificationRequirement,
		],
		operation: { productId: "a" },
		products: [{ id: "a", name: "Tour La Paz" }],
		resources: [],
	})
	const container = await AstroContainer.create()
	const html = await container.renderToString(Evidence, {
		props: {
			surface: "tour-activity",
			documents: [doc],
			documentPresentation: { d: presentation },
			scopeProductId: "a",
		},
	})
	expect(html).toContain("Aprobado")
	expect(html).toContain("Requiere revisión de alcance")
	expect(html).toContain("Sin alcance declarado")
	expect(html).not.toContain("Sirve para esta experiencia")
	expect(html).not.toContain("oferta vinculada")
})
