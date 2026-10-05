import { describe, it, expect } from "vitest"
import {
	evaluateTourCapabilities,
	buildTourDiagnostic,
	summarizeTourDiagnostic,
	tourPublicationBlockers,
	type TourObservations,
} from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"
const context = resolveTourCommercialContext({
	productId: "tour",
	options: [
		{
			variantId: "option",
			name: "Salida",
			bookingMode: "shared",
			lifecycleState: "ready",
			salesEnabled: true,
			hasProfile: true,
			hasCapacity: true,
			rates: [{ ratePlanId: "rate", name: "Tarifa", isActive: true, isDefault: true }],
		},
	],
})
function fixture(patch: Partial<TourObservations> = {}) {
	return buildTourDiagnostic({
		providerId: "provider",
		productId: "tour",
		context,
		observations: {
			...Object.fromEntries(
				Object.keys(TOUR_REQUIREMENTS).map((id) => [id, { ready: true, message: "Pendiente" }])
			),
			...patch,
		} as TourObservations,
	})
}
describe("B3 independent authoritative observations", () => {
	it("shared bookings require current availability even when publication is eligible", () => {
		const diagnostic = fixture({ current_availability: { ready: false, message: "Agotado" } })
		expect(evaluateTourCapabilities(diagnostic).publish.allowed).toBe(true)
		expect(evaluateTourCapabilities(diagnostic).book.allowed).toBe(false)
	})
	it("private requests do not grant immediate booking or require a shared hold", () => {
		const diagnostic = fixture({
			current_availability: { ready: false, message: "Sin fecha compartida" },
		})
		diagnostic.context.selection = {
			state: "resolved",
			variantId: "option",
			ratePlanId: "rate",
			bookingMode: "private",
			source: "url",
		}
		expect(evaluateTourCapabilities(diagnostic).receive_request.allowed).toBe(true)
		expect(evaluateTourCapabilities(diagnostic).book).toMatchObject({ allowed: false })
	})

	it("a rate without valid price stays pending while its profile is ready", () => {
		const diagnostic = fixture({ price: { ready: false, message: "Define precio" } })
		expect(diagnostic.requirements.option_profile.result.state).toBe("ready")
		expect(summarizeTourDiagnostic(diagnostic).preparation.readinessPercent).toBe(90)
		expect(tourPublicationBlockers(diagnostic).map((b) => b.id)).toEqual(["price"])
	})
	it("preparation correction links activate complete-to-publish", () => {
		const diagnostic = fixture({ presentation: { ready: false, message: "Falta presentación" } })
		const result = diagnostic.requirements.presentation.result
		if (!("action" in result)) throw new Error("missing action")
		const url = new URL(result.action.href, "https://fastt.test")
		expect(url.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(url.searchParams.get("step")).toBe("content")
		expect(url.searchParams.get("variantId")).toBe("option")
		expect(url.searchParams.get("ratePlanId")).toBe("rate")
	})
	it.each([
		"provider_authorization",
		"experience_authorization",
		"option_activation",
		"rate_activation",
	] as const)("%s blocks publication without reducing preparation", (id) => {
		const diagnostic = fixture({ [id]: { ready: false, message: "Resuelve requisito" } })
		expect(summarizeTourDiagnostic(diagnostic).preparation.readinessPercent).toBe(100)
		expect(tourPublicationBlockers(diagnostic).map((b) => b.id)).toEqual([id])
	})
	it("exhausted dates are configured but no longer operational; publication is not preparation", () => {
		const diagnostic = fixture({ current_availability: { ready: false, message: "Agotado" } })
		expect(summarizeTourDiagnostic(diagnostic).preparation.readinessPercent).toBe(100)
		expect(summarizeTourDiagnostic(diagnostic).operation.complete).toBe(false)
		expect(tourPublicationBlockers(diagnostic)).toEqual([])
	})
	it("ambiguous selection cannot grant option or rate readiness", () => {
		const diagnostic = buildTourDiagnostic({
			providerId: "provider",
			productId: "tour",
			context: {
				status: "unresolved",
				productId: "tour",
				options: [],
				variantId: null,
				ratePlanId: null,
				reason: "selection_required",
			},
			observations: Object.fromEntries(
				Object.keys(TOUR_REQUIREMENTS).map((id) => [id, { ready: true, message: "Pendiente" }])
			) as TourObservations,
		})
		expect(diagnostic.requirements.price.result.state).toBe("not_evaluable")
		expect(summarizeTourDiagnostic(diagnostic).preparation.readinessPercent).toBe(50)
	})
})

it("retry actions preserve unvalidated intent without granting readiness or capabilities", () => {
	const diagnostic = buildTourDiagnostic({
		providerId: "provider",
		productId: "tour",
		context: {
			status: "read_failed",
			productId: "tour",
			recoveryIntent: { variantId: "offer-A", ratePlanId: "rate-A" },
		},
		observations: Object.fromEntries(
			Object.keys(TOUR_REQUIREMENTS).map((id) => [
				id,
				{ ready: false, code: "read_failed", message: "Consulta fallida" },
			])
		) as TourObservations,
	})
	expect(diagnostic.context.selection).toEqual({ state: "unresolved", reason: "read_failed" })
	expect(evaluateTourCapabilities(diagnostic).publish.allowed).toBe(false)
	for (const id of ["price", "conditions", "option_profile", "current_availability"] as const) {
		const result = diagnostic.requirements[id].result
		expect(result.state).toBe("not_evaluable")
		if (!("action" in result)) throw new Error("Missing retry action")
		const retry = new URL(result.action.href, "https://fastt.test")
		expect(retry.searchParams.get("variantId")).toBe("offer-A")
		expect(retry.searchParams.get("ratePlanId")).toBe("rate-A")
		expect(retry.pathname).toBe("/product/tour/preview")
	}
})
