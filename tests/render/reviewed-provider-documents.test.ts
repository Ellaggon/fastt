import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import ReviewedProviderDocuments from "@/components/admin/ReviewedProviderDocuments.astro"

const document = {
	id: "document-a",
	providerId: "provider-a",
	typeLabel: "Identidad",
	status: "verified",
	fileName: "identidad.pdf",
	fileUrl: "private-storage-key",
	reviewedAt: new Date("2026-10-10T12:00:00Z"),
	reviewNotes: "Revisión manual completada",
	expiresAt: null,
}
async function render(overrides = {}, canPreview = true) {
	const container = await AstroContainer.create()
	return container.renderToString(ReviewedProviderDocuments, {
		props: { documents: [{ ...document, ...overrides }], canPreview },
	})
}
describe("reviewed provider documents", () => {
	it("keeps the result consultable without repeat decision controls or raw file URLs", async () => {
		const html = await render()
		expect(html).toContain("Verificado")
		expect(html).toContain("Revisado el")
		expect(html).toContain("Revisión manual completada")
		expect(html).toContain("data-preview-document")
		expect(html).not.toContain("private-storage-key")
		expect(html).not.toContain("data-verify-document")
		expect(html).not.toContain("data-reject-document-form")
	})
	it("distinguishes an expired approval from current verification", async () => {
		expect(await render({ expiresAt: new Date("2020-01-01") })).toContain(
			"Vencido · requiere renovación"
		)
	})
	it("preserves rejection reason without offering a second decision", async () => {
		const html = await render({ status: "rejected", reviewNotes: "Archivo ilegible" })
		expect(html).toContain("Rechazado")
		expect(html).toContain("Archivo ilegible")
		expect(html).not.toContain("data-verify-document")
	})
	it("requires permission for access to the original", async () => {
		expect(await render({}, false)).not.toContain("data-preview-document")
	})
	it("does not mislabel a replaced version as rejected", async () => {
		const html = await render({ status: "superseded" })
		expect(html).toContain("Sustituido")
		expect(html).not.toContain("Rechazado")
	})
	it("opens results when the review queue is finished", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ReviewedProviderDocuments, {
			props: { documents: [document], canPreview: false, expanded: true },
		})
		expect(html).toMatch(/<details\s+open/)
	})
})
