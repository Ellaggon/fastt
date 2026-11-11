import { z } from "zod"

const explanation = z.string().trim().min(10).max(2000)
const reference = z.string().trim().min(3).max(1000)
export const insuranceReviewFields = {
	insuredAndGuides: "Titular y guias cubiertos",
	activityTerritoryDates: "Actividad, territorio y fechas",
	limitsAndDeductibles: "Limites por persona, siniestro, agregado y franquicias",
	exclusionsAndLegalMinima: "Exclusiones y minimos legales aplicables",
	accidentAssistanceApplicability: "Aplicabilidad de accidentes y asistencia",
	sufficiencyRationale: "Justificacion de suficiencia segun riesgos",
	evidenceReference: "Referencia del expediente y poliza",
}

export function coverageReviewKind(key: string): "insurance" | "route" | null {
	return key.endsWith("bo.tour.liability_insurance")
		? "insurance"
		: key.endsWith("bo.tour.route_applicability_review")
			? "route"
			: null
}

export function coverageReviewFromForm(
	kind: "insurance" | "route",
	values: Record<string, unknown>
) {
	const review: Record<string, unknown> = {
		version: 1,
		kind,
		nextReview: values["coverage.nextReview"],
		reviewerComment: String(values.comment ?? ""),
	}
	if (kind === "insurance") {
		for (const key of Object.keys(insuranceReviewFields)) review[key] = values[`coverage.${key}`]
	} else {
		review.itineraryReference = values["coverage.itineraryReference"]
		const indices = [
			...new Set(
				Object.keys(values).flatMap((key) => {
					const match = /^coverage\.places\.(\d+)\./.exec(key)
					return match ? [Number(match[1])] : []
				})
			),
		].sort((a, b) => a - b)
		review.places = indices.map((index) =>
			Object.fromEntries(
				["placeReference", "outcome", "basis", "permitReference", "validUntil"].flatMap((key) => {
					const value = values[`coverage.places.${index}.${key}`]
					return value ? [[key, value]] : []
				})
			)
		)
	}
	return JSON.stringify(review)
}
const insurance = z
	.object({
		version: z.literal(1),
		kind: z.literal("insurance"),
		reviewerComment: z.string().max(4000).optional(),
		insuredAndGuides: explanation,
		activityTerritoryDates: explanation,
		limitsAndDeductibles: explanation,
		exclusionsAndLegalMinima: explanation,
		accidentAssistanceApplicability: explanation,
		sufficiencyRationale: explanation,
		evidenceReference: reference,
		nextReview: z.iso.date(),
	})
	.strict()
const route = z
	.object({
		version: z.literal(1),
		kind: z.literal("route"),
		reviewerComment: z.string().max(4000).optional(),
		itineraryReference: reference,
		places: z
			.array(
				z
					.object({
						placeReference: reference,
						outcome: z.enum(["required", "not_applicable"]),
						basis: explanation,
						permitReference: reference.optional(),
						validUntil: z.iso.date().optional(),
					})
					.strict()
					.superRefine((place, ctx) => {
						if (place.outcome === "required" && (!place.permitReference || !place.validUntil))
							ctx.addIssue({ code: "custom", message: "permit_evidence_and_validity_required" })
					})
			)
			.min(1)
			.max(100),
		nextReview: z.iso.date(),
	})
	.strict()

export function validateCoverageReviewNotes(key: string, notes: string, now = new Date()) {
	const kind = coverageReviewKind(key)
	if (!kind) return
	try {
		const parsed = JSON.parse(notes)
		const review = kind === "insurance" ? insurance.parse(parsed) : route.parse(parsed)
		const today = now.toISOString().slice(0, 10)
		if (review.nextReview <= today) throw new Error("review_date_not_future")
		if (
			review.kind === "route" &&
			review.places.some((place) => place.outcome === "required" && place.validUntil! < today)
		)
			throw new Error("permit_expired")
		return JSON.stringify(review)
	} catch {
		throw Object.assign(new Error("coverage_structured_review_required"), { status: 422 })
	}
}
