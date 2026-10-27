import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Kyc from "@/components/provider/ProviderKycSlotsCard.astro"
import Operation from "@/components/provider/ProviderTourOperatingContext.astro"
import type { ProviderKycSlot } from "@/lib/provider-documents"

const slot: ProviderKycSlot = {
	type: "government_id",
	label: "Documento de identidad",
	description: "",
	consequence: "",
	captureExample: "",
	state: "verified",
	stateLabel: "Verificado",
	documentId: "doc",
	fileName: "identidad.pdf",
	reviewedAt: new Date("2026-10-20T12:00:00Z"),
	reviewNotes: null,
	rejectCategoryLabel: null,
	uploadHref: "",
	fiscalBridge: null,
}
it.each([
	["government_id", true],
	["government_id", false],
	["business_registration", true],
	["business_registration", false],
] as const)(
	"shows verified %s inline and gates file access: %s",
	async (type, canManageDocuments) => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Kyc, {
			props: { slots: [{ ...slot, type }], elevated: true, canManageDocuments },
		})
		expect(html).toContain("Verificado")
		expect(html).not.toContain("Ver detalle")
		expect(html).not.toContain("<details")
		expect(html).toContain("data-kyc-verified-detail")
		expect(html).toContain("identidad.pdf")
		expect(html).toContain("Revisado el")
		expect(html).not.toContain("data-kyc-slot-upload-open")
		expect(html.includes("Abrir archivo seguro")).toBe(canManageDocuments)
		expect(html).toContain(`id="kyc-slots-${type}"`)
	}
)
it("keeps saved operation compact and editable without losing its fields", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Operation, {
		props: {
			productId: "a",
			canEdit: true,
			context: {
				operatingRole: "guide",
				jurisdictionCode: "BO-LP",
				activityClassesJson: ["urban_cultural"],
			},
		},
	})
	expect(html).toContain("data-operation-saved-summary")
	expect(html).toContain("Editar operación")
	expect(html).toContain("Guardar cambios")
	expect(html).toContain("data-operation-cancel")
	expect(html).not.toMatch(/<details[^>]*open/)
	expect(html).toContain('name="operatingRole"')
})
it("opens incomplete operation for correction", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Operation, {
		props: { productId: "a", canEdit: true, context: null },
	})
	expect(html).toMatch(/<details[^>]*open/)
	expect(html).toContain("Guardar operación")
	expect(html).not.toContain("data-operation-saved-summary")
})
