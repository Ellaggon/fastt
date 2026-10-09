import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import TourPresentationForm from "@/components/tours/TourPresentationForm.astro"
it("renders an editorial presentation without creation instructions and keeps its return", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(TourPresentationForm, {
		request: new Request(
			"https://fastt.test/product/tour/presentation?returnTo=%2Fproduct%2Ftour%3FvariantId%3Doption%26ratePlanId%3Drate"
		),
		props: {
			providerId: "provider",
			productId: "tour",
			name: "Paseo",
			guided: false,
			options: { linkedIds: [], places: [], categories: [] },
		},
	})
	expect(html).toContain("Presentación del tour")
	expect(html).toContain("Guardar presentación")
	expect(html).not.toContain("Después completarás el recorrido")
	expect(html).toContain("/product/tour?variantId=option")
})
