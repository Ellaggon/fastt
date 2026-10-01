import { describe, expect, it } from "vitest"
import {
	TOUR_REQUIREMENTS,
	summarizeTourDiagnostic,
	tourDiagnosticSchema,
	type TourDiagnostic,
	type TourRequirementId,
} from "@/lib/tours/tourDiagnosticContract"

function fixture(mode: "shared" | "private" = "shared"): TourDiagnostic {
	const requirements = Object.fromEntries(
		Object.entries(TOUR_REQUIREMENTS).map(([id, definition]) => [
			id,
			{
				scope:
					definition.scope === "product"
						? { kind: "product", productId: "tour" }
						: definition.scope === "option"
							? { kind: "option", productId: "tour", variantId: "option" }
							: { kind: "rate", productId: "tour", variantId: "option", ratePlanId: "rate" },
				result: { state: "ready", evidence: { source: "reference-fixture", reference: id } },
			},
		])
	) as TourDiagnostic["requirements"]
	return {
		version: 1,
		context: {
			providerId: "provider",
			productId: "tour",
			selection: {
				state: "resolved",
				variantId: "option",
				ratePlanId: "rate",
				bookingMode: mode,
				source: "url",
			},
			timezone: "America/La_Paz",
			observedAt: "2026-09-30T12:00:00Z",
		},
		requirements,
	}
}

const pending = {
	state: "pending",
	reason: { code: "missing", message: "Completa el requisito" },
	responsible: "provider",
	action: { label: "Corregir", href: "/product/tour" },
} as const

describe("B1 tour diagnosis contract", () => {
	it.each<TourRequirementId>(["option_profile", "price", "conditions", "calendar_configuration"])(
		"keeps %s independent",
		(id) => {
			const diagnosis = fixture()
			diagnosis.requirements[id].result = pending
			expect(summarizeTourDiagnostic(diagnosis).preparation).toMatchObject({
				readyCount: 9,
				totalCount: 10,
				readinessPercent: 90,
				complete: false,
			})
		}
	)
	it.each<TourRequirementId>([
		"provider_authorization",
		"experience_authorization",
		"option_activation",
		"rate_activation",
		"current_availability",
	])("does not let %s change preparation", (id) => {
		const diagnosis = fixture()
		diagnosis.requirements[id].result = {
			...pending,
			state: "blocked",
			reason: {
				code: id === "current_availability" ? "sold_out" : "in_review",
				message: "No habilitado",
			},
		}
		expect(summarizeTourDiagnostic(diagnosis).preparation.readinessPercent).toBe(100)
		expect(summarizeTourDiagnostic(diagnosis)[TOUR_REQUIREMENTS[id].axis].complete).toBe(false)
	})
	it("does not treat read failures as missing data or ready", () => {
		const diagnosis = fixture()
		diagnosis.requirements.price.result = {
			...pending,
			state: "not_evaluable",
			reason: { code: "read_failed", message: "Reintenta la consulta" },
		}
		expect(summarizeTourDiagnostic(diagnosis).preparation.readinessPercent).toBe(90)
	})
	it("private requests never imply a quote, hold or booking", () => {
		expect(summarizeTourDiagnostic(fixture("private")).transactionSemantics).toBe(
			"request_without_hold_or_quote"
		)
		expect(summarizeTourDiagnostic(fixture()).transactionSemantics).toBe(
			"booking_requires_quote_and_hold"
		)
	})
	it("rejects mixed selections and foreign products", () => {
		const diagnosis = fixture()
		diagnosis.requirements.price.scope = {
			kind: "rate",
			productId: "tour",
			variantId: "other",
			ratePlanId: "rate",
		}
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
		diagnosis.requirements.price.scope = {
			kind: "rate",
			productId: "hotel",
			variantId: "option",
			ratePlanId: "rate",
		}
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
	})
	it("requires all observations and rejects invented progress", () => {
		const diagnosis = fixture()
		const { price: omitted, ...requirements } = diagnosis.requirements
		expect(omitted).toBeDefined()
		expect(tourDiagnosticSchema.safeParse({ ...diagnosis, requirements }).success).toBe(false)
		expect(tourDiagnosticSchema.safeParse({ ...diagnosis, wizardStep: 6 }).success).toBe(false)
	})
	it("cannot waive private price or calendar preparation without a new contract", () => {
		const diagnosis = fixture("private")
		diagnosis.requirements.price.result = {
			state: "not_applicable",
			reason: { code: "private", message: "Privado" },
			applicabilityReference: "unsupported",
		}
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
	})
	it("represents no selected option without guessing readiness", () => {
		const diagnosis = fixture()
		diagnosis.context.selection = { state: "unresolved", reason: "selection_required" }
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
		for (const id of Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[]) {
			if (TOUR_REQUIREMENTS[id].scope !== "product")
				diagnosis.requirements[id].result = { ...pending, state: "not_evaluable" }
		}
		expect(summarizeTourDiagnostic(diagnosis).transactionSemantics).toBe("unresolved")
	})
	it("rejects unsafe correction URLs and invalid timezones", () => {
		const diagnosis = fixture()
		diagnosis.requirements.price.result = {
			...pending,
			action: { label: "Corregir", href: "//external.test" },
		}
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
		diagnosis.requirements.price.result = pending
		diagnosis.context.timezone = "property_local"
		expect(tourDiagnosticSchema.safeParse(diagnosis).success).toBe(false)
	})
	it("not applicable is explicit and never turns an empty axis into readiness", () => {
		const diagnosis = fixture("private")
		diagnosis.requirements.current_availability.result = {
			state: "not_applicable",
			reason: { code: "request_without_hold", message: "La solicitud no reserva cupo" },
			applicabilityReference: "create-tour-private-request",
		}
		expect(summarizeTourDiagnostic(diagnosis).operation).toEqual({
			readyCount: 0,
			totalCount: 0,
			complete: false,
		})
		expect(summarizeTourDiagnostic(diagnosis).preparation.readinessPercent).toBe(100)
	})
})
