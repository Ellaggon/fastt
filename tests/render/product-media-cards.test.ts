import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import ProductMediaGallery from "@/components/product/ProductMediaGallery.astro"
import ProductLocationSummary from "@/components/product/ProductLocationSummary.astro"

it("keeps one photo status and an accessible icon action", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(ProductMediaGallery, {
		props: { imagesHref: "/product/test/images", singularLabel: "experiencia" },
	})
	expect(html).toContain('aria-label="Gestionar fotos"')
	expect(html).toContain('title="Gestionar fotos"')
	expect(html.match(/id="blockBadge-images"/g)).toHaveLength(1)
	expect(html).not.toContain("summaryImagesCount")
	expect(html).toContain("min-h-[88px]")
})

it("keeps the location editor accessible and its media height stable", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(ProductLocationSummary, {
		props: {
			title: "Ubicación y encuentro",
			editHref: "/product/test/location",
			productName: "Tour de prueba",
		},
	})
	expect(html).toContain('aria-label="Editar ubicación"')
	expect(html).toContain('title="Editar ubicación"')
	expect(html).toContain("min-h-[88px]")
	expect(html).toContain("h-[280px]")
	expect(html).toContain("data-product-location-preview")
})
