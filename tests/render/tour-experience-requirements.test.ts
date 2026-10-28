import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Workspace from "@/components/tours/TourExperienceRequirements.astro"
import type { ProviderVerificationWorkspaceModel } from "@/lib/provider-verification-workspace"

function model(complete: boolean, pending: boolean): ProviderVerificationWorkspaceModel {
	return {
		tourContext: complete
			? {
					operatingRole: "guide",
					jurisdictionCode: "BO-LP",
					activityClassesJson: ["urban_cultural"],
				}
			: null,
		canEditTourContext: true,
		canManageDocuments: false,
		tourPlaybook: ["activity", "safety"].map((id) => ({
			id,
			uiState: pending ? "not_evaluable" : "not_applicable",
			stateLabel: pending ? "Requisitos por definir" : "Sin requisitos adicionales",
		})),
		screen: { sections: [{ id: "tour", items: [], title: "Experiencia" }] },
		tourEvidenceOptions: { activity: [], safety: [] },
		tourProducts: [],
		documents: [],
		tourResources: [],
		tourDocumentPresentation: {},
		documentAssignments: {},
		result: "",
		error: "",
		requestedType: "",
	} as unknown as ProviderVerificationWorkspaceModel
}

it("shows a single pending Fastt decision without asking for more documents", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Workspace, {
		props: { model: model(true, true), productId: "tour-a" },
	})
	expect(html).toContain("Operación y requisitos")
	expect(html.match(/Fastt debe definir/g)).toHaveLength(1)
	expect(html).not.toContain("data-optional-upload-form")
	expect(html).not.toContain("data-verification-trust-panel")
	expect(html).toContain("Editar operación")
	expect(html).toContain("Datos de operación")
	expect(html).not.toContain("Operación declarada para determinar sus respaldos")
	expect(html).toContain("md:!mt-16")
	expect(html).toContain("data-operation-saved-summary")
})
it("keeps missing operation actionable without two repeated prerequisite notices", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Workspace, {
		props: { model: model(false, true), productId: "tour-a" },
	})
	expect(html).toContain("Guardar operación")
	expect(html).not.toContain("Fastt debe definir")
	expect(html).not.toContain("data-optional-upload-form")
})
it("does not equate unavailable requirement data with approval", async () => {
	const container = await AstroContainer.create()
	const input = model(true, false)
	input.screen = null
	const html = await container.renderToString(Workspace, {
		props: { model: input, productId: "tour-a" },
	})
	expect(html).toContain("No se pudieron determinar los requisitos")
	expect(html).toContain("Esto no confirma la habilitación")
	expect(html).not.toContain("La evaluación vigente no exige")
})

it("summarizes an explicitly resolved absence of extra requirements once", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Workspace, {
		props: { model: model(true, false), productId: "tour-a" },
	})
	expect(html.match(/La evaluación vigente no exige/g)).toHaveLength(1)
	expect(html).not.toContain("data-optional-upload-form")
})
