import { describe, expect, it } from "vitest"
import type { ProductFullAggregate } from "@/modules/catalog/public"
import { evaluateTourContentReadiness } from "@/lib/tours/tourContentReadiness"

function contentFixture(): ProductFullAggregate {
	return {
		id: "tour",
		displayName: "Paseo",
		productType: "tour",
		status: "draft",
		geoPlace: {
			id: "place",
			canonicalName: "La Paz",
			canonicalPath: "/la-paz",
			placeType: "city",
			countryCode: "BO",
		},
		content: { description: "Un recorrido guiado", highlights: ["Mercado"] },
		location: { address: "Plaza", lat: 0, lng: 0 },
		images: Array.from({ length: 5 }, (_, index) => ({
			id: String(index),
			url: "/image.jpg",
			objectKey: String(index),
			isPrimary: index === 0,
			order: index,
		})),
		subtype: {
			kind: "tour",
			duration: "2 horas",
			durationMinutes: 120,
			difficultyLevel: null,
			meetingPoint: { address: "Plaza" },
			itinerary: [{ title: "A" }, { title: "B" }, { title: "C" }],
			safety: null,
			guide: null,
			includes: ["Guía"],
			excludes: [],
			categories: [],
			pickup: null,
		},
	}
}
const declarations = { hasCategory: true, hasActiveTickets: true }
describe("five-stage content close", () => {
	it("can finish content without any commercial option or authorization", () => {
		expect(evaluateTourContentReadiness(contentFixture(), declarations).complete).toBe(true)
	})
	it("does not congratulate a saved but incomplete draft", () => {
		const aggregate = contentFixture()
		aggregate.images.pop()
		const result = evaluateTourContentReadiness(aggregate, declarations)
		expect(result.complete).toBe(false)
		expect(result.photos).toBe(false)
	})
	it("requires categories and active participant types independently", () => {
		expect(
			evaluateTourContentReadiness(contentFixture(), { ...declarations, hasCategory: false })
				.complete
		).toBe(false)
		expect(
			evaluateTourContentReadiness(contentFixture(), { ...declarations, hasActiveTickets: false })
				.complete
		).toBe(false)
	})
	it("keeps absent location pending and accepts valid zero coordinates", () => {
		const aggregate = contentFixture()
		expect(evaluateTourContentReadiness(aggregate, declarations).location).toBe(true)
		aggregate.location.lat = null
		expect(evaluateTourContentReadiness(aggregate, declarations).complete).toBe(false)
	})
})
