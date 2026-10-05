import { describe, expect, it } from "vitest"
import { projectTourLogisticsObservation } from "@/lib/tours/tourPreparationRequirements"

const details = { sectionKey: "subtype", complete: true, detail: "Detalles listos" } as const
const itinerary = { sectionKey: "itinerary", complete: true, detail: "Itinerario listo" } as const
const location = {
	sectionKey: "location",
	complete: false,
	detail: "Agrega coordenadas antes de publicar.",
} as const

describe("logistics stage correction", () => {
	it("keeps saved details and sends a missing location to the location form", () => {
		const result = projectTourLogisticsObservation([details, itinerary, location], "tour", {
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(result.ready).toBe(false)
		expect(result.message).toBe(location.detail)
		const url = new URL(result.action!.href, "http://local")
		expect(url.pathname).toBe("/product/tour/location")
		expect(url.searchParams.get("variantId")).toBe("option")
		expect(url.searchParams.get("ratePlanId")).toBe("rate")
	})
	it("marks the stage complete only when every saved section is ready", () => {
		expect(
			projectTourLogisticsObservation([details, itinerary, { ...location, complete: true }], "tour")
		).toMatchObject({ ready: true })
	})
	it("sends missing itinerary to the shared details form", () => {
		const result = projectTourLogisticsObservation(
			[details, { ...itinerary, complete: false }, location],
			"tour"
		)
		expect(new URL(result.action!.href, "http://local").pathname).toBe("/product/tour/subtype")
		expect(result.message).toBe(itinerary.detail)
	})
})
