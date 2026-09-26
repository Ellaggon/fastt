import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { tourGalleryLayout } from "@/lib/tours/tourGalleryLayout"

const read = (path: string) => readFileSync(path, "utf8")

describe("tour PDP visual base and gallery", () => {
	it("keeps photographs independent from global pill button styling", () => {
		const gallery = read("src/components/tours/TourGallery.astro")

		expect(gallery).toContain("tour-gallery-tile")
		expect(gallery).not.toContain('class="fastt-button')
		expect(gallery).toContain("border-radius: 0")
		expect(gallery).toContain("group-hover:scale-[1.025]")
		expect(gallery).toContain("prefers-reduced-motion: reduce")
	})

	it("defines complete empty, single, pair and five-image compositions", () => {
		const gallery = read("src/components/tours/TourGallery.astro")

		expect(gallery).toContain("Fotos pendientes")
		expect(tourGalleryLayout(0)).toBe("single")
		expect(tourGalleryLayout(1)).toBe("single")
		expect(tourGalleryLayout(2)).toBe("two")
		expect(tourGalleryLayout(5)).toBe("five")
		expect(tourGalleryLayout(12)).toBe("five")
		expect(gallery).toContain("visibleImages = galleryImages.slice(0, 5)")
		expect(gallery).toContain("Ver todas las fotos")
	})

	it("places the product identity before the gallery on a light public surface", () => {
		const page = read("src/pages/tours/[id]/index.astro")

		expect(page).toContain('bodyClass="bg-white text-slate-950"')
		expect(page.indexOf("<h1")).toBeLessThan(page.indexOf("<TourGallery"))
		expect(page).toContain('tone="light"')
	})
})
