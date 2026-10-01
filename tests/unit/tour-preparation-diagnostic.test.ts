import { beforeEach, describe, it, expect, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	aggregate: vi.fn(),
	context: vi.fn(),
	commercial: vi.fn(),
	authorization: vi.fn(),
}))
vi.mock("@/container", () => ({
	productRepository: {
		getProductAggregate: async () => ({
			verticalReadiness: { kind: "tour", tour: { hasActiveTickets: true, hasCategory: true } },
		}),
	},
}))
vi.mock("@/modules/catalog/public", () => ({
	getProductFullAggregate: mocks.aggregate,
	getProductVariantsAggregate: vi.fn(),
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: mocks.context,
}))
vi.mock("@/lib/tours/loadTourAuthorization", () => ({ loadTourAuthorization: mocks.authorization }))
vi.mock("@/lib/rates/validateRatePlanPublication", () => ({
	validateRatePlanPublication: mocks.commercial,
}))
vi.mock("@/modules/policies/public", () => ({ resolveEffectivePolicies: vi.fn() }))
vi.mock("@/lib/playbook/evaluate-add-room-progress", () => ({ loadVariantCompletion: vi.fn() }))
vi.mock("@/modules/house-rules/public", () => ({ buildGuestStayExpectationsSnapshot: vi.fn() }))
vi.mock("@/lib/policies/audit-tour-policy-compatibility", () => ({
	auditTourProductPolicyCompatibility: async () => [],
}))
import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { publicationValidationErrorsFromState } from "@/lib/product/canonical-product-publication"
import { evaluateTourLaunchProgress } from "@/lib/playbook/evaluate-tour-launch-progress"
const observations = {
	priceReady: true,
	capacityReady: true,
	conditionsReady: true,
	configuredDateCount: 2,
	availableDateCount: 1,
}
beforeEach(() => {
	mocks.aggregate.mockResolvedValue({
		productType: "tour",
		displayName: "Tour",
		geoPlace: { id: "place" },
		content: { description: "Experiencia", highlights: ["Vista"] },
		images: Array(5).fill({}),
		location: { lat: -16, lng: -68 },
		subtype: {
			kind: "tour",
			durationMinutes: 120,
			meetingPoint: "Plaza",
			includes: ["Guía"],
			itinerary: [{}, {}, {}],
		},
	})
	mocks.context.mockResolvedValue({
		status: "resolved",
		source: "url",
		productId: "tour",
		variantId: "option",
		ratePlanId: "rate",
		options: [],
		option: {
			variantId: "option",
			name: "Salida",
			bookingMode: "shared",
			lifecycleState: "ready",
			salesEnabled: true,
			hasProfile: true,
			hasCapacity: true,
			rates: [],
		},
		rate: { ratePlanId: "rate", isActive: true },
	})
	mocks.commercial.mockResolvedValue({
		canPublish: true,
		blockers: [],
		blockerDetails: [],
		observations,
	})
	mocks.authorization.mockResolvedValue({
		provider_authorization: { ready: true, message: "" },
		experience_authorization: { ready: true, message: "" },
	})
})
const input = { providerId: "provider", productId: "tour" }
describe("B3 shared preparation and server diagnosis", () => {
	it("reports a real missing price in preparation, guide and server with identical progress", async () => {
		mocks.commercial.mockResolvedValue({ observations: { ...observations, priceReady: false } })
		const state = (await loadCompleteToPublishState(input))!
		const guide = (await evaluateTourLaunchProgress("tour", "provider"))!
		expect(state.readinessPercent).toBe(90)
		expect(guide.progress).toEqual({ completedSteps: 9, totalSteps: 10, progressPercent: 90 })
		expect(state.tourDiagnostic!.requirements.option_profile.result.state).toBe("ready")
		expect(publicationValidationErrorsFromState(state).map((error) => error.code)).toEqual([
			"price",
		])
		expect(
			state.blockers.filter((check) => check.sectionKey !== "preview").map((check) => check.key)
		).toEqual(["price"])
	})
	it("configured but sold-out dates do not undo preparation; their operating state is explicit", async () => {
		mocks.commercial.mockResolvedValue({ observations: { ...observations, availableDateCount: 0 } })
		const state = (await loadCompleteToPublishState(input))!
		expect(state.readinessPercent).toBe(100)
		expect(state.tourDiagnostic!.requirements.current_availability.result.state).toBe("pending")
		expect(state.readyToPublish).toBe(true)
		expect(publicationValidationErrorsFromState(state)).toEqual([])
	})
	it("authorization blocks the server without becoming a document preparation counter", async () => {
		mocks.authorization.mockResolvedValue({
			provider_authorization: { ready: true, message: "" },
			experience_authorization: { ready: false, message: "Licencia fuera de alcance" },
		})
		const state = (await loadCompleteToPublishState(input))!
		expect(state.readinessPercent).toBe(100)
		expect(state.readyToPublish).toBe(false)
		expect(publicationValidationErrorsFromState(state)).toEqual([
			expect.objectContaining({
				code: "experience_authorization",
				message: "Licencia fuera de alcance",
			}),
		])
	})
	it("a commercial read failure is not an invented missing price and cannot grant publication", async () => {
		mocks.commercial.mockRejectedValue(new Error("db unavailable"))
		const state = (await loadCompleteToPublishState(input))!
		expect(state.tourDiagnostic!.requirements.price.result.state).toBe("not_evaluable")
		expect(state.readyToPublish).toBe(false)
		const presentation = presentTourDiagnostic(state.tourDiagnostic!, {
			previewHref: "/product/tour/preview",
		})
		expect(presentation.primaryAction.label).toBe("Volver a intentar")
		expect(presentation.nextResponsible).toBe("fastt")
		expect(presentation.primaryAction.href).toContain("variantId=option&ratePlanId=rate")
	})
})

import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { summarizeProductPreparation } from "@/lib/playbook/summarize-product-preparation"
import { contextualizeTourLink } from "@/lib/tours/tourProviderNavigation"

describe("B5 surface parity", () => {
	it("uses the exact price reason and action in cards, preview, guide and API errors", async () => {
		mocks.commercial.mockResolvedValue({
			observations: { ...observations, priceReady: false },
			blockerDetails: [{ id: "price", label: "Falta el precio de esta tarifa." }],
		})
		const state = (await loadCompleteToPublishState(input))!
		const card = (await summarizeProductPreparation(input))!
		const preview = presentTourDiagnostic(state.tourDiagnostic!, { previewHref: card.previewHref })
		const error = publicationValidationErrorsFromState(state)[0]
		expect(card.tourPresentation?.primaryAction).toEqual(error.action)
		expect(preview.primaryAction).toEqual(error.action)
		expect(card.nextStepBody).toBe(error.message)
		expect(state.blockers[0].detail).toBe(error.message)
		expect(state.blockers[0].cta).toBe(error.action!.label)
		const target = new URL(error.action!.href, "https://fastt.test")
		expect(target.pathname).toBe("/rates/plans/rate")
		expect(Object.fromEntries(target.searchParams)).toMatchObject({
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
			vista: "price",
		})
	})
	it("builds a usable conditions tab URL without nesting a second query separator", async () => {
		mocks.commercial.mockResolvedValue({
			observations: { ...observations, conditionsReady: false },
		})
		const state = (await loadCompleteToPublishState(input))!
		const action = publicationValidationErrorsFromState(state)[0].action!
		const target = new URL(action.href, "https://fastt.test")
		expect(target.searchParams.get("vista")).toBe("conditions")
		expect(target.searchParams.get("ratePlanId")).toBe("rate")
		expect(target.searchParams.get("variantId")).toBe("option")
	})
	it("does not let a ready capacity mark an incomplete option profile as complete in the guide", async () => {
		const context = await mocks.context()
		mocks.context.mockResolvedValue({
			...context,
			option: { ...context.option, hasProfile: false },
		})
		const guide = (await evaluateTourLaunchProgress("tour", "provider"))!
		expect(guide.steps.find((step) => step.key === "departure")?.complete).toBe(false)
	})
	it("separates a Fastt decision from preparation and retains its corrective action", async () => {
		mocks.authorization.mockResolvedValue({
			provider_authorization: { ready: true, message: "" },
			experience_authorization: {
				ready: false,
				responsible: "fastt",
				message: "Fastt debe definir la política aplicable.",
				action: {
					label: "Consultar pendiente de Fastt",
					href: "/provider/settings/verification?line=tour&experience=tour",
				},
			},
		})
		const card = (await summarizeProductPreparation(input))!
		expect(card.readinessPercent).toBe(100)
		expect(card.readyToPublish).toBe(false)
		expect(card.tourPresentation).toMatchObject({
			message: "Ficha preparada. Habilitación para publicar pendiente.",
			nextResponsible: "fastt",
			primaryAction: { label: "Consultar pendiente de Fastt" },
		})
		expect(card.continuePreparationHref).toContain("experience=tour")
	})
	it("keeps a sold-out published tour prepared while directing its operational action to its calendar", async () => {
		mocks.commercial.mockResolvedValue({ observations: { ...observations, availableDateCount: 0 } })
		const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
		expect(card.readinessPercent).toBe(100)
		expect(card.tourPresentation?.message).toBe("Publicado · disponibilidad actual pendiente.")
		expect(card.tourPresentation?.primaryAction.label).toBe("Revisar disponibilidad")
		expect(card.tourPresentation?.primaryAction.href).toContain("variantId=option&ratePlanId=rate")
		expect(card.tourPresentation?.publicationBlockers).toEqual([])
	})
	it("sends an ambiguous secondary calendar link through selection with its return destination", () => {
		const context = {
			status: "unresolved" as const,
			reason: "selection_required" as const,
			productId: "tour",
			options: [],
			variantId: null,
			ratePlanId: null,
		}
		const href = contextualizeTourLink("/rates/calendar?productId=tour&focus=availability", context)
		const url = new URL(href, "https://fastt.test")
		expect(url.pathname).toBe("/product/tour/select-offer")
		expect(url.searchParams.get("returnTo")).toBe(
			"/rates/calendar?productId=tour&focus=availability"
		)
	})
})
