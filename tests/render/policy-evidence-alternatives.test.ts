import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Editor from "@/components/admin/PolicyEvidenceAlternatives.astro"
describe("policy evidence editor", () => {
	it("renders package checkboxes and registered-subject selectors using shared controls", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Editor, {
			props: {
				definitions: [{ id: "id-v1", label: "Identidad", family: "government_id" }],
				versionId: "policy-v1",
				allowLegacy: false,
			},
		})
		expect(html).toContain('name="alternative.0"')
		expect(html).toContain('value="id-v1"')
		expect(html).toContain('name="evidenceSubjectSelector"')
		expect(html).toContain('value="guides"')
		expect(html).toContain("Todos estos documentos")
		expect(html).toContain("Añadir alternativa")
	})
})
