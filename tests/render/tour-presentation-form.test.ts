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
			},
		},
	})
	expect(html.match(/<form\b/g)).toHaveLength(1)
	for (const field of ["name", "geoPlaceId", "description", "highlights", "categoryId"])
		expect(html).toContain(`name="${field}"`)
	expect(html).toContain("Descripción existente")
	expect(html).toContain("Guía local")
	expect(html).toContain('value="city" selected')
	expect(html.match(/type="checkbox"[^>]*checked/g)).toHaveLength(2)
	expect(html).toContain('action="/api/product/tour-presentation"')
	expect(html).toContain('name="variantId" value="option"')
	expect(html).not.toContain("/categories?")
})
