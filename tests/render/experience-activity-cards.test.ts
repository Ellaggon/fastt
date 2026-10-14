import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Cards from "@/components/tours/ExperienceActivityCards.astro"
const activities = [
	{ id: "tasting", name: "Degustación de productos", parentCategoryId: "food", isActive: true },
	{ id: "old", name: "Actividad retirada", parentCategoryId: "food", isActive: false },
]
it("renders labelled radio cards and excludes inactive choices without creating a product form", async () => {
	const html = await (
		await AstroContainer.create()
	).renderToString(Cards, {
		props: {
			activities,
			families: [{ id: "food", name: "Gastronomía y bebidas" }],
			selected: "tasting",
		},
	})
	expect(html).toContain("Degustación de productos")
	expect(html).toContain('type="radio"')
	expect(html).toContain("checked")
	expect(html).not.toContain("Actividad retirada")
	expect(html).not.toContain("productId")
})
it("dialog choices do not impose native required validation on the presentation form", async () => {
	const html = await (
		await AstroContainer.create()
	).renderToString(Cards, {
		props: {
			activities,
			families: [{ id: "food", name: "Gastronomía y bebidas" }],
			name: "activityChoice",
		},
	})
	expect(html).not.toContain(" required")
})
