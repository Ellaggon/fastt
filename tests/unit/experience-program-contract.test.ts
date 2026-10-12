import { expect, it } from "vitest"
import {
	experienceProgramMomentCount,
	experienceHasMeetingPoint,
	evaluateExperienceProgram,
} from "@/shared/domain/experience-program"
import { tourPublicationValidationErrors } from "@/lib/tours/tourAdminQuality"
it("counts supported historical content and rejects empty records", () => {
	expect(
		experienceProgramMomentCount([
			null,
			{},
			"  ",
			{ description: " " },
			"Inicio",
			{ title: "Práctica" },
			{ description: "Cierre" },
		])
	).toBe(3)
})
it("does not treat null coordinates as zero", () => {
	expect(experienceHasMeetingPoint({ lat: null, lng: null })).toBe(false)
	expect(experienceHasMeetingPoint({ lat: 0, lng: 0 })).toBe(true)
	expect(experienceHasMeetingPoint({ lat: 100, lng: 0 })).toBe(false)
})
it.each(["guided_tour", "class", "workshop", "tasting", null] as const)(
	"quality and preparation agree on valid moments for %s",
	(format) => {
		const result = evaluateExperienceProgram({
			experienceFormat: format,
			durationMinutes: 60,
			meetingPoint: { address: "Sala" },
			itinerary: [{}, { description: "Práctica" }, { description: " " }],
			includes: ["Materiales"],
		})
		const errors = tourPublicationValidationErrors({
			experienceFormat: format,
			status: "draft",
			imageCount: 5,
			itinerarySteps: result.momentCount,
			hasMeetingPoint: result.checks.meetingPoint,
			hasDurationMinutes: result.checks.duration,
			hasIncludes: result.checks.includes,
			categoryCount: 1,
			activeTicketCount: 1,
			activeSalidaCount: 1,
			completeSalidaCount: 1,
		})
		expect(errors.some((error) => error.code === "missing_tour_itinerary")).toBe(!result.complete)
	}
)
