import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Form from "@/components/tours/TourPresentationForm.astro"
it("renders one precarged form for all presentation requirements", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Form, {
		request: new Request(
			"https://fastt.test/product/tour/presentation?playbook=launch-tour&flow=create&variantId=option&ratePlanId=rate"
		),
		props: {
			providerId: "provider",
			productId: "tour",
			name: "Paseo cultural",
			geoPlaceId: "city",
			description: "Descripción existente",
			highlights: ["Guía local", "Centro histórico"],
			options: {
				places: [{ id: "city", name: "La Paz", country: "BO", placeType: "city" }],
				categories: [
					{ id: "culture", slug: "cultural", name: "Cultura" },
					{ id: "city-tour", slug: "city-tour", name: "City tour" },
				],
				linkedIds: ["culture", "city-tour"],

				families: [
					{ id: "arts", name: "Arte y artesanía", isActive: true },
					{ id: "food", name: "Gastronomía", isActive: true },
				],
				activities: [
					{ id: "ceramics", name: "Cerámica", parentCategoryId: "arts", isActive: true },
				],
				additionalThemeIds: ["food"],
				classification: { classificationRevision: 4, primaryActivityCategoryId: "ceramics" },
			},
		},
	})
	expect(html.match(/<form\b/g)).toHaveLength(1)
	for (const field of [
		"name",
		"geoPlaceId",
		"description",
		"highlights",
		"primaryActivityCategoryId",
		"additionalThemeId",
	])
		expect(html).toContain(`name="${field}"`)
	expect(html).toContain("Descripción existente")
	expect(html).toContain("Guía local")
	expect(html).toContain('value="city" selected')
	expect(html.match(/type="checkbox"[^>]*checked/g)).toHaveLength(1)
	expect(html).toContain('action="/api/product/tour-presentation"')
	expect(html).toContain('name="variantId" value="option"')
	expect(html).not.toContain("/categories?")
})

it.each([
	[null, 0, null],
	[null, 1, null],
	["guided_tour", 1, "Visita o recorrido guiado"],
	["workshop", 1, "Taller"],
	["class", 1, "Clase"],
	["tasting", 1, "Degustación"],
] as const)(
	"preserves format %s without inferring it from themes",
	async (experienceFormat, formatContractVersion, label) => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Form, {
			request: new Request("https://fastt.test/product/tour/presentation"),
			props: {
				providerId: "provider",
				productId: "tour",
				experienceFormat,
				formatContractVersion,
				options: {
					places: [],
					categories: [{ id: "food", slug: "gastronomy", name: "Gastronomía" }],
					linkedIds: ["food"],
				},
			},
		})
		const select = html.match(/<select[^>]*name="experienceFormat"[\s\S]*?<\/select>/)?.[0] ?? ""
		expect(select).toContain('value="guided_tour"')
		expect(select.includes("required")).toBe(formatContractVersion === 1)
		if (experienceFormat)
			expect(select).toMatch(new RegExp(`value="${experienceFormat}" selected[^>]*>\\s*${label}`))
		else expect(select).not.toMatch(/value="(?:guided_tour|workshop|class|tasting)" selected/)
		expect(html).toContain("Temas adicionales")
		expect(html).toContain("Nombre de la experiencia")
		for (const format of ["guided_tour", "workshop", "class", "tasting"]) expect(select).toContain(`value="${format}"`)
	}
)
