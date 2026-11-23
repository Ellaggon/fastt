import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import ProviderDocumentAccess from "@/components/admin/ProviderDocumentAccess.astro"
const doc = {
	id: "document-a",
	providerId: "provider-a",
	status: "rejected",
	fileUrl: "private-storage-key",
	reviewNotes: "Reemplaza el archivo ilegible",
}
async function render(canPreview: boolean, cases: unknown[] = []) {
	const container = await AstroContainer.create()
	return container.renderToString(ProviderDocumentAccess, {
		props: { document: doc, canPreview, cases },
	})
}
it("opens rejected documents through protected access without exposing storage keys", async () => {
	const html = await render(true, [
		{ id: "case-a", sourceType: "ProviderDocument", sourceRef: doc.id, status: "resolved" },
	])
	expect(html).toContain("Abrir documento")
	expect(html).toContain("/admin/cases/case-a")
	expect(html).toContain(doc.reviewNotes)
	expect(html).not.toContain(doc.fileUrl)
})
it("does not offer file access without sensitive reveal permission", async () => {
	const html = await render(false)
	expect(html).not.toContain("data-document-open=")
	expect(html).not.toContain("Ver expediente")
})
