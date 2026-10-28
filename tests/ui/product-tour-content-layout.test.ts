import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("groups tour photos and location before presentation, leaving participants full width", () => {
	const source = readFileSync("src/pages/product/[id]/index.astro", "utf8")
	const start = source.indexOf("data-product-media-location-row=")
	const end = source.indexOf('<div class="space-y-3">', start)
	const row = source.slice(start, end)
	expect(row).toContain("<ProductMediaGallery")
	expect(row).toContain('title="Ubicación y encuentro"')
	expect(source).toContain('isTour && "grid items-start gap-5 lg:grid-cols-2"')
	expect(end).toBeLessThan(source.indexOf('title={isTour ? "Presentación"'))
	expect(source.indexOf('title="Participantes"')).toBeGreaterThan(end)
	expect(source).toContain("!isTour && (")
})

it("retains the address and map hooks in the shared location summary", () => {
	const source = readFileSync("src/components/product/ProductLocationSummary.astro", "utf8")
	expect(source).toContain('id="blockBadge-location"')
	expect(source).toContain('id="summaryAddress"')
	expect(source).toContain("<ProductLocationPreview")
	expect(source).toContain("href={editHref}")
})
