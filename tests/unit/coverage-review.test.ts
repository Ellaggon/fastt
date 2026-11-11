import { expect, it } from "vitest"
import { validateCoverageReviewNotes, coverageReviewFromForm } from "@/lib/documents/coverage-review"

const now = new Date("2026-11-09T12:00:00Z")
const insurance = {
	version: 1, kind: "insurance", insuredAndGuides: "Titular y guias cubiertos",
	activityTerritoryDates: "Ruta urbana, territorio y fechas revisados",
	limitsAndDeductibles: "Limites y franquicias revisados",
	exclusionsAndLegalMinima: "Exclusiones y minimos contrastados",
	accidentAssistanceApplicability: "Aplicabilidad separada documentada",
	sufficiencyRationale: "Justificacion segun riesgos del itinerario",
	evidenceReference: "expediente-sintetico", nextReview: "2026-12-01",
}
it("requires structured insurance review, not a generic approval note", () => {
	expect(() => validateCoverageReviewNotes("bo.tour.liability_insurance", "Todo bien", now)).toThrow()
	expect(JSON.parse(validateCoverageReviewNotes("bo.tour.liability_insurance", JSON.stringify(insurance), now)!)).toEqual(insurance)
	for (const field of Object.keys(insurance)) {
		const incomplete: Record<string, unknown> = { ...insurance }
		delete incomplete[field]
		expect(() => validateCoverageReviewNotes("bo.tour.liability_insurance", JSON.stringify(incomplete), now)).toThrow()
	}
})
it("requires route basis and current permit when applicable; pending cannot be approved", () => {
	const review = { version: 1, kind: "route", itineraryReference: "ruta-sintetica",
		places: [{ placeReference: "municipio-sintetico", outcome: "not_applicable", basis: "Fundamento verificable de aplicabilidad" }], nextReview: "2026-12-01" }
	const validate = (value: unknown) => validateCoverageReviewNotes("bo.tour.route_applicability_review", JSON.stringify(value), now)
	expect(validate(review)).toBeTruthy()
	for (const outcome of ["pending", "required"])
		expect(() => validate({ ...review, places: [{ ...review.places[0], outcome }] })).toThrow()
	expect(() => validate({ ...review, places: [] })).toThrow()
	expect(() => validate({ ...review, nextReview: "2026-11-08" })).toThrow()
	expect(() => validate({ ...review, places: [{ ...review.places[0], outcome: "required", permitReference: "permiso-sintetico", validUntil: "2026-11-08" }] })).toThrow()
})
it("does not change unrelated legacy document reviews", () => {
	expect(validateCoverageReviewNotes("bo.tour.guide_credential", "Nota existente", now)).toBeUndefined()
})
it("serializes ordinary insurance fields and preserves reviewer commentary", () => {
	const values = Object.fromEntries(Object.entries(insurance).map(([key, value]) => [`coverage.${key}`, value]))
	const notes = coverageReviewFromForm("insurance", { ...values, comment: "Comentario adicional" })
	expect(JSON.parse(validateCoverageReviewNotes("bo.tour.liability_insurance", notes, now)!)).toMatchObject({ ...insurance, reviewerComment: "Comentario adicional" })
})
it("collects all route rows in order without inventing non-applicability", () => {
	const notes = coverageReviewFromForm("route", {
		"coverage.itineraryReference": "ruta-prueba", "coverage.nextReview": "2026-12-01",
		"coverage.places.1.placeReference": "sitio-dos", "coverage.places.1.outcome": "not_applicable",
		"coverage.places.1.basis": "Fundamento verificable segundo sitio",
		"coverage.places.0.placeReference": "sitio-uno", "coverage.places.0.outcome": "required",
		"coverage.places.0.basis": "Permiso exigido por autoridad local",
		"coverage.places.0.permitReference": "permiso-prueba", "coverage.places.0.validUntil": "2026-12-01",
	})
	const parsed = JSON.parse(validateCoverageReviewNotes("bo.tour.route_applicability_review", notes, now)!)
	expect(parsed.places.map((place: { placeReference: string }) => place.placeReference)).toEqual(["sitio-uno", "sitio-dos"])
})
