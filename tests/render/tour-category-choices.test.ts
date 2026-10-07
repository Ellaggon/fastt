import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Choices from "@/components/tours/TourCategoryChoices.astro"

describe("shared tour activity selection", () => {
	it.each([false, true])(
		"keeps labels, category identifiers and saved selection in stacked=%s",
		async (stacked) => {
			const container = await AstroContainer.create()
			const html = await container.renderToString(Choices, {
				props: {
					categories: [
						{ id: "trek", name: "Trekking" },
						{ id: "culture", name: "Cultura y patrimonio" },
					],
					selectedIds: new Set(["culture"]),
					stacked,
				},
			})
			expect(html).toContain("¿Qué tipo de experiencia ofreces?")
			expect(html).toContain("Puedes seleccionar varias.")
			expect(html.match(/name="categoryId"/g)).toHaveLength(2)
			expect(html).toMatch(/value="culture"[^>]*checked/)
			expect(html).not.toContain("Criterios de calidad")
		}
	)
})
