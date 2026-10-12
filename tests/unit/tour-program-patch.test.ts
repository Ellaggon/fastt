import { expect, it } from "vitest"
import { tourProgramPatch } from "@/modules/catalog/application/tourProgramPatch"
import { tourSchema } from "@/schemas/product/subtype"
const current = {
	duration: "1 hora",
	durationMinutes: 60,
	meetingPointJson: { address: "Sala 2", instructions: "Puerta lateral", coordinates: [1, 2] },
	itineraryJson: [{ step: 1, description: "Práctica acompañada" }],
	includesJson: ["Materiales"],
	guideJson: { guideType: "Guía", license: "original" },
	pickupJson: { defaultArea: "Centro" },
	difficultyLevel: "hard",
}
it("preserves hidden fields and unedited JSON keys", () => {
	const form = new FormData()
	form.set("meetingPointAddress", "Sala 3")
	expect(tourProgramPatch(form, current)).toEqual({
		meetingPointJson: { ...current.meetingPointJson, address: "Sala 3" },
	})
})
it("explicit empties clear only edited fields", () => {
	const form = new FormData()
	form.set("guideType", "")
	form.set("tourExcludes", "")
	form.set("difficultyLevel", "")
	expect(tourProgramPatch(form, current)).toEqual({
		guideJson: { license: "original" },
		excludesJson: [],
		difficultyLevel: null,
	})
})
it("class program accepts one moment while guided and historical require three", () => {
	for (const format of ["class", "workshop", "tasting", "guided_tour", null]) {
		expect(
			tourSchema.safeParse({
				...current,
				productId: "id",
				productType: "tour",
				experienceFormat: format,
			}).success
		).toBe(format !== "guided_tour" && format !== null)
	}
})
it("commas do not create extra moments", () => {
	const form = new FormData()
	form.set("tourItinerary", "Aprender, practicar, compartir")
	expect(tourProgramPatch(form, current).itineraryJson).toEqual([
		{ step: 1, description: "Aprender, practicar, compartir" },
	])
})
