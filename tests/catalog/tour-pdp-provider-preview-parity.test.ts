import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(path), "utf8")

describe("tour PDP provider preview parity", () => {
	it("uses the public composition while restricting preview to the owning tour provider", () => {
		const page = read("src/pages/tours/[id]/index.astro")

		expect(page).toContain("getProviderIdFromRequest")
		expect(page).toContain("eq(Product.providerId, previewProviderId)")
		expect(page).toContain(
			'if (requestedProviderPreview && !isProviderPreview) return Astro.redirect("/tours")'
		)
		expect(page).toContain("<TourGallery")
		expect(page).toContain("<TourDepartureSection")
		expect(page).toContain("previewMode={isProviderPreview}")
		expect(page).toContain("data-provider-preview-banner")
	})

	it("labels preview-only differences and cannot start a booking flow", () => {
		const page = read("src/pages/tours/[id]/index.astro")
		const booking = read("src/components/tours/TourDepartureSection.astro")

		expect(page).toContain("descriptionNeedsEditorialReview")
		expect(page).toContain("data-preview-content-warning")
		expect(booking).toContain('data-tour-booking-root={previewMode ? undefined : ""}')
		expect(booking).toContain("data-preview-booking-disabled")
		expect(booking).toContain("!previewMode ? (")
		expect(booking).toContain("disabled={previewMode || !hasSearchedDeparture}")
	})

	it("keeps client indexing metadata out of the private preview", () => {
		const page = read("src/pages/tours/[id]/index.astro")

		expect(page).toContain("productData && !isProviderPreview")
		expect(page).toContain('"@type": "TouristTrip"')
	})
})
