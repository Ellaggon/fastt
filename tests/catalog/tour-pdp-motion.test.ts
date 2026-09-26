import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(path), "utf8")

describe("tour PDP movement and interaction", () => {
	it("keeps the gallery viewer keyboard, focus, and touch operable", () => {
		const gallery = read("src/components/tours/TourGallery.astro")

		expect(gallery).toContain("data-gallery-stage")
		expect(gallery).toContain('stage?.addEventListener("pointerdown"')
		expect(gallery).toContain('stage?.addEventListener("pointerup"')
		expect(gallery).toContain('dialog?.addEventListener("keydown"')
		expect(gallery).toContain("opener?.isConnected")
		expect(gallery).toContain("prefers-reduced-motion: reduce")
	})

	it("makes selection feedback interruptible and preserves touch focus", () => {
		const booking = read("src/components/tours/TourDepartureSection.astro")

		expect(booking).toContain("selectionMotion?.cancel()")
		expect(booking).toContain("data-tour-group-disclosure")
		expect(booking).toContain("data-tour-group-content")
		expect(booking).toContain("event.detail === 0")
		expect(booking).toContain("prefers-reduced-motion: reduce")
		expect(booking).toContain('setSelectionPanelState(latestHoldId ? "held" : "selected")')
	})
})
