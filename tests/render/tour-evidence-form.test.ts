import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Evidence from "@/components/provider/ProviderVerificationOptionals.astro"

async function render(
	value: string,
	surface: "archive" | "tour-activity" | "tour-safety" = "tour-activity"
) {
	const container = await AstroContainer.create()
	return container.renderToString(Evidence, {
		props: {
			surface,
			documentTypes: [{ value, label: "Respaldo requerido" }],
			defaultUploadType: value,
			canManageDocuments: true,
			scopeProductId: "tour-a",
			guideResources: [{ id: "guide-a", name: "Ana Pérez" }],
			availableProducts: [
				{ id: "tour-a", name: "Tour A", kind: "tour" },
				{ id: "tour-b", name: "Tour B", kind: "tour" },
			],
		},
	})
}
describe("requirement-specific tour evidence", () => {
	it("identifies a personal credential through a named registered guide", async () => {
		const html = await render("operating_license::tour.guide_credential")
		expect(html).toContain("Guía titular de la credencial")
		expect(html).toContain("Ana Pérez")
		expect(html).toContain('value="guide-a"')
		expect(html).not.toContain('value="legal_entity"')
		expect(html).not.toContain("Identificador del guía o recurso registrado")
	})
	it("limits an operator licence to business holders", async () => {
		const html = await render("operating_license::tour.operator_license")
		expect(html).toContain('value="provider"')
		expect(html).toContain('value="legal_entity"')
		expect(html).not.toContain('value="third_party"')
		expect(html).not.toContain('value="person"')
	})
	it("asks for actual insurance coverage without selecting territory or activities", async () => {
		const html = await render("insurance::tour.insurance", "tour-safety")
		expect(html).toContain("Asegurado que figura en la póliza")
		expect(html).toContain("Nombre o razón social del asegurado")
		expect(html).not.toMatch(/value="BO-LP"[^>]*selected/)
		expect(html).not.toMatch(/name="activityClass"[^>]*checked/)
		expect(html).toContain("Vincular otras ofertas (opcional)")
		expect(html).not.toContain('placeholder="BO-LP o código de permiso"')
	})
	it("preserves the archival generic editor", async () => {
		const html = await render("operating_license", "archive")
		expect(html).toContain("Referencia del titular")
		expect(html).toContain('placeholder="BO-LP o código de permiso"')
	})
})

it("renews the selected expired document and accepts an explicit requirement choice without copying coverage", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Evidence, {
		props: {
			surface: "tour-activity",
			canManageDocuments: true,
			scopeProductId: "tour-a",
			renewalDocumentId: "old",
			defaultUploadType: "operating_license::tour.guide_credential",
			documentTypes: [
				{ value: "operating_license::tour.guide_credential", label: "Credencial" },
				{ value: "operating_license::tour.operator_license", label: "Licencia" },
			],
			documents: [
				{
					id: "old",
					type: "operating_license",
					typeLabel: "Credencial",
					status: "verified",
					expiresAt: new Date("2020-01-01"),
					scopes: [],
					subjectType: "person",
					subjectReference: "guide-a",
				},
			],
			guideResources: [{ id: "guide-a", name: "Ana Pérez" }],
		},
	})
	expect(html).toContain('name="replacesDocumentId" value="old"')
	expect(html).toContain('name="type" value="operating_license::tour.guide_credential"')
	expect(html).toContain("Guía titular de la credencial")
	expect(html).not.toMatch(/value="guide-a"[^>]*selected/)
	expect(html).not.toMatch(/value="BO-LP"[^>]*selected/)
})
