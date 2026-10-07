import { beforeEach, describe, it, expect, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	aggregate: vi.fn(),
	context: vi.fn(),
	commercial: vi.fn(),
	authorization: vi.fn(),
	readiness: vi.fn(),
}))
vi.mock("@/container", () => ({
	variantManagementRepository: {},
	ratePlanPricingReadRepository: {},
	productRepository: {
		getProductAggregate: async () => ({
			verticalReadiness: { kind: "tour", tour: { hasActiveTickets: true, hasCategory: true } },
		}),
	},
}))
vi.mock("@/modules/catalog/public", () => ({
	getProductFullAggregate: mocks.aggregate,
	evaluateVariantReadiness: mocks.readiness,
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
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: async () => ({ userId: "user", providerId: "provider" }),
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	getProductOperationalSurface: async () => null,
}))
vi.mock("@/lib/observability/performanceLog", () => ({ logRoutePerformance: vi.fn() }))
// Mock persistence only: the endpoint, summary, diagnostic and both guide projections stay real.
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select: () => ({
				from: () => ({
					where: async () => [{ state: (await mocks.aggregate()).status ?? "draft" }],
				}),
			}),
		},
	}
})
vi.mock("@/lib/policies/audit-tour-policy-compatibility", () => ({
	auditTourProductPolicyCompatibility: async () => [],
}))
import {
	loadCompleteToPublishState,
	evaluateCompleteToPublishProgress,
} from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { publicationValidationErrorsFromState } from "@/lib/product/canonical-product-publication"
import { evaluateTourLaunchProgress } from "@/lib/playbook/evaluate-tour-launch-progress"
import { GET as productSummaryGET } from "@/pages/api/internal/product-summary"
const observations = {
	priceReady: true,
	capacityReady: true,
	conditionsReady: true,
	configuredDateCount: 2,
	futureDateCount: 2,
	futureCapacityDateCount: 2,
	availableDateCount: 1,
}
beforeEach(() => {
	mocks.readiness.mockResolvedValue({ lifecycleState: "ready", validationErrors: [] })
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
		expect(state.readinessPercent).toBe(91)
		expect(guide.progress).toEqual({ completedSteps: 10, totalSteps: 11, progressPercent: 91 })
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

import { presentTourDiagnostic, summarizeTourCatalog } from "@/lib/tours/tourDiagnosticPresentation"
import { evaluateTourCapabilities } from "@/lib/tours/buildTourDiagnostic"
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

describe("B7 parity across preparation surfaces and server blockers", () => {
	it.each([
		"price",
		"conditions",
		"calendar",
		"sold_out",
		"commercial_failure",
		"authorization_failure",
		"ambiguous",
	])("preserves the same diagnosis for %s", async (scenario) => {
		if (scenario === "price")
			mocks.commercial.mockResolvedValue({ observations: { ...observations, priceReady: false } })
		if (scenario === "conditions")
			mocks.commercial.mockResolvedValue({
				observations: { ...observations, conditionsReady: false },
			})
		if (scenario === "calendar")
			mocks.commercial.mockResolvedValue({
				observations: { ...observations, configuredDateCount: 0, availableDateCount: 0 },
			})
		if (scenario === "sold_out")
			mocks.commercial.mockResolvedValue({
				observations: { ...observations, availableDateCount: 0 },
			})
		if (scenario === "commercial_failure")
			mocks.commercial.mockRejectedValue(new Error("read failed"))
		if (scenario === "authorization_failure")
			mocks.authorization.mockRejectedValue(new Error("read failed"))
		if (scenario === "ambiguous")
			mocks.context.mockResolvedValue({
				status: "unresolved",
				productId: "tour",
				reason: "selection_required",
				options: [],
				variantId: null,
				ratePlanId: null,
			})
		const state = (await loadCompleteToPublishState(input))!
		const preview = presentTourDiagnostic(state.tourDiagnostic!, {
			previewHref: "/product/tour/preview",
		})
		const server = publicationValidationErrorsFromState(state)
		const card = (await summarizeProductPreparation({ ...input, status: "draft" }))!
		for (const step of ["content", "rate", "preview"]) {
			const guide = (await evaluateTourLaunchProgress("tour", "provider", { currentStepId: step }))!
			expect(guide.progress.progressPercent).toBe(state.readinessPercent)
			expect(guide.tourPresentation?.publicationBlockers).toEqual(preview.publicationBlockers)
			expect(guide.tourPresentation?.stages).toEqual(preview.stages)
		}
		expect(card.tourPresentation?.publicationBlockers).toEqual(preview.publicationBlockers)
		expect(card.readinessPercent).toBe(state.readinessPercent)
		expect(server.map((e) => ({ code: e.code, message: e.message, action: e.action }))).toEqual(
			preview.publicationBlockers.map((b) => ({
				code: b.id,
				message: b.reason.message,
				action: b.action,
			}))
		)
		expect(state.readyToPublish).toBe(server.length === 0)
		expect(state.blockers.some((check) => check.key === "preview")).toBe(false)
	})
})

describe("catalog readiness ignores stale editorial ready state", () => {
	it.each(["conditions", "authorization", "activation", "ambiguous", "read_failure"])(
		"does not label or count a stored ready tour as publishable after %s changes",
		async (scenario) => {
			if (scenario === "conditions")
				mocks.commercial.mockResolvedValue({
					observations: { ...observations, conditionsReady: false },
				})
			if (scenario === "authorization")
				mocks.authorization.mockResolvedValue({
					provider_authorization: { ready: true, message: "" },
					experience_authorization: { ready: false, message: "Licencia pendiente" },
				})
			if (scenario === "activation") {
				const context = await mocks.context()
				mocks.context.mockResolvedValue({ ...context, rate: { ...context.rate, isActive: false } })
			}
			if (scenario === "ambiguous")
				mocks.context.mockResolvedValue({
					status: "unresolved",
					reason: "selection_required",
					productId: "tour",
					options: [],
					variantId: null,
					ratePlanId: null,
				})
			if (scenario === "read_failure") mocks.commercial.mockRejectedValue(new Error("unavailable"))
			const card = (await summarizeProductPreparation({ ...input, status: "ready" }))!
			expect(card.statusLabel).toBe(card.tourPresentation!.catalogStatus.label)
			expect(card.statusVariant).toBe(card.tourPresentation!.catalogStatus.variant)
			expect(card.statusLabel).not.toBe("Listo para publicar")
			expect(card.tourPresentation!.catalogStatus.readyToPublish).toBe(false)
			expect(card.tourPresentation!.catalogStatus.label).not.toBe("Listo para publicar")
			expect(
				summarizeTourCatalog([{ published: false, presentation: card.tourPresentation }])
					.readyToPublish
			).toBe(0)
			if (scenario === "ambiguous")
				expect(card.tourPresentation!.catalogStatus.label).toBe("Selecciona oferta")
		}
	)
	it("counts a genuinely publishable draft even if its stored state is draft, excluding published tours and unread diagnoses", async () => {
		const draft = (await summarizeProductPreparation({ ...input, status: "draft" }))!
		const published = (await summarizeProductPreparation({ ...input, status: "published" }))!
		expect(draft.statusLabel).toBe("Listo para publicar")
		expect(draft.statusVariant).toBe("success")
		expect(published.statusLabel).toBe("Publicado")
		expect(draft.tourPresentation!.catalogStatus.label).toBe("Listo para publicar")
		expect(published.tourPresentation!.catalogStatus.label).toBe("Ficha preparada")
		expect(
			summarizeTourCatalog([
				{ published: false, presentation: draft.tourPresentation },
				{ published: true, presentation: published.tourPresentation },
				{ published: false },
			])
		).toEqual({ total: 3, published: 1, prepared: 2, readyToPublish: 1 })
	})
	it("keeps sold-out offers prepared without turning operation into preparation", async () => {
		mocks.commercial.mockResolvedValue({ observations: { ...observations, availableDateCount: 0 } })
		const card = (await summarizeProductPreparation({ ...input, status: "draft" }))!
		expect(card.tourPresentation!.catalogStatus).toMatchObject({
			prepared: true,
			readyToPublish: true,
		})
	})
})

describe("operation respects the selected booking mode", () => {
	it("enables private requests without shared inventory in card, guide and capability decision", async () => {
		const context = await mocks.context()
		mocks.context.mockResolvedValue({
			...context,
			option: { ...context.option, bookingMode: "private" },
		})
		mocks.commercial.mockResolvedValue({
			observations: {
				...observations,
				availableDateCount: 0,
				futureDateCount: 0,
				futureCapacityDateCount: 0,
			},
		})
		const state = (await loadCompleteToPublishState(input))!
		const diagnosis = state.tourDiagnostic!
		expect(diagnosis.requirements.current_availability.result.state).toBe("not_applicable")
		expect(evaluateTourCapabilities(diagnosis).receive_request.allowed).toBe(true)
		expect(evaluateTourCapabilities(diagnosis).book.allowed).toBe(false)
		const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
		expect(card.tourPresentation!.message).toBe("Publicado · solicitudes privadas habilitadas.")
		expect(card.tourPresentation!.primaryAction.label).toBe("Revisar ficha")
		expect(card.tourPresentation!.blockers).toEqual([])
		expect(state.readinessPercent).toBe(100)
		const guide = (await evaluateTourLaunchProgress("tour", "provider"))!
		expect(guide.tourPresentation!.blockers).toEqual([])
	})
	it.each(["activation", "authorization", "read_failure"])(
		"does not grant private requests with %s pending",
		async (scenario) => {
			const context = await mocks.context()
			mocks.context.mockResolvedValue({
				...context,
				option: {
					...context.option,
					bookingMode: "private",
					salesEnabled: scenario !== "activation",
				},
			})
			if (scenario === "authorization")
				mocks.authorization.mockResolvedValue({
					provider_authorization: { ready: false, message: "Identidad pendiente" },
					experience_authorization: { ready: true, message: "" },
				})
			if (scenario === "read_failure") mocks.commercial.mockRejectedValue(new Error("unavailable"))
			const state = (await loadCompleteToPublishState(input))!
			expect(evaluateTourCapabilities(state.tourDiagnostic!).receive_request.allowed).toBe(false)
			const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
			expect(card.tourPresentation!.message).not.toContain("solicitudes privadas habilitadas")
			expect(card.tourPresentation!.blockers.map((b) => b.id)).not.toContain("current_availability")
		}
	)
	it.each([
		[0, 0, "no_future_dates", "No hay fechas futuras"],
		[2, 0, "dates_closed", "no tienen cupo habilitado"],
		[2, 2, "sold_out", "Todos los cupos"],
	] as const)(
		"distinguishes shared operation %s/%s",
		async (futureDateCount, futureCapacityDateCount, code, message) => {
			mocks.commercial.mockResolvedValue({
				observations: {
					...observations,
					availableDateCount: 0,
					futureDateCount,
					futureCapacityDateCount,
				},
			})
			const state = (await loadCompleteToPublishState(input))!
			expect(state.tourDiagnostic!.requirements.current_availability.result).toMatchObject({
				state: "pending",
				reason: { code },
			})
			const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
			expect(card.tourPresentation!.support).toContain(message)
			expect(card.tourPresentation!.primaryAction.label).toBe("Revisar disponibilidad")
			expect(state.readinessPercent).toBe(100)
		}
	)
	it("keeps commercial pause separate from available dates", async () => {
		const context = await mocks.context()
		mocks.context.mockResolvedValue({
			...context,
			option: { ...context.option, salesEnabled: false },
		})
		const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
		expect(card.tourPresentation!.nextRequirementId).toBe("option_activation")
		expect(card.tourPresentation!.support).toContain("desactivada para venta")
	})
})

it("catalog and guide retry the original offer after context failure", async () => {
	mocks.context.mockResolvedValue({
		status: "read_failed",
		productId: "tour",
		recoveryIntent: { variantId: "offer-A", ratePlanId: "rate-A" },
	})
	const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
	const guide = (await evaluateTourLaunchProgress("tour", "provider"))!
	for (const presentation of [card.tourPresentation!, guide.tourPresentation!]) {
		expect(presentation.primaryAction.label).toBe("Volver a intentar")
		const url = new URL(presentation.primaryAction.href, "https://fastt.test")
		expect(url.searchParams.get("variantId")).toBe("offer-A")
		expect(url.searchParams.get("ratePlanId")).toBe("rate-A")
		expect(presentation.catalogStatus.readyToPublish).toBe(false)
	}
})

it("shares read-model readiness in activation and preparation without persisting lifecycle", async () => {
	mocks.readiness.mockResolvedValue({
		lifecycleState: "draft",
		validationErrors: [{ code: "pricing_missing", message: "Missing pricing summary" }],
	})
	const state = (await loadCompleteToPublishState(input))!
	expect(state.tourDiagnostic!.requirements.price.result.state).toBe("pending")
	const presentation = presentTourDiagnostic(state.tourDiagnostic!, {
		previewHref: "/product/tour/preview",
	})
	expect(presentation.activation.allowed).toBe(false)
	expect(presentation.activation.blockers.map((b) => b.id)).toContain("price")
	expect(mocks.readiness).toHaveBeenCalledWith(expect.objectContaining({ persist: false }), {
		variantId: "option",
		ratePlanId: "rate",
	})
	mocks.readiness.mockRejectedValue(new Error("read unavailable"))
	const failed = (await loadCompleteToPublishState(input))!
	expect(failed.tourDiagnostic!.requirements.price.result.state).toBe("not_evaluable")
	expect(
		presentTourDiagnostic(failed.tourDiagnostic!, { previewHref: "/product/tour/preview" })
			.activation.allowed
	).toBe(false)
})

describe("one diagnosis snapshot per request and selection", () => {
	const clearReads = () => Object.values(mocks).forEach((mock) => mock.mockClear())
	it("shares concurrent page/layout evaluations and their underlying reads", async () => {
		clearReads()
		const url = new URL("https://fastt.test/product/tour/preview?variantId=option&ratePlanId=rate")
		const request = new Request(url)
		const params = { ...input, request, url }
		const page = loadCompleteToPublishState(params)
		const same = loadCompleteToPublishState(params)
		expect(same).toBe(page)
		const layout = evaluateTourLaunchProgress("tour", "provider", {
			currentStepId: "preview",
			request,
			url,
		})
		const completeLayout = evaluateCompleteToPublishProgress("tour", "provider", {
			currentStepId: "preview",
			request,
			url,
		})
		const [state, guide, completeGuide] = await Promise.all([page, layout, completeLayout])
		expect(completeGuide!.tourPresentation!.activation).toEqual(guide!.tourPresentation!.activation)
		expect(guide!.tourPresentation!.activation).toEqual(
			presentTourDiagnostic(state!.tourDiagnostic!, { previewHref: "/product/tour/preview" })
				.activation
		)
		for (const mock of [mocks.aggregate, mocks.commercial, mocks.authorization, mocks.readiness])
			expect(mock).toHaveBeenCalledTimes(1)
	})
	it("normalizes explicit URL intent and ignores session and visual navigation differences", async () => {
		clearReads()
		const request = new Request("https://fastt.test/product/tour/preview")
		const first = loadCompleteToPublishState({
			...input,
			request,
			url: new URL("https://fastt.test/?variantId=%20option%20&ratePlanId=rate&step=preview"),
			session: { variantId: "B", ratePlanId: "B-rate" },
		})
		const second = loadCompleteToPublishState({
			...input,
			request,
			url: new URL("https://fastt.test/?variantId=option&ratePlanId=rate&step=rate"),
			selection: { variantId: "C" },
			session: { variantId: "C" },
		})
		expect(first).toBe(second)
		await first
		expect(mocks.commercial).toHaveBeenCalledTimes(1)
	})
	it("keeps different option/rate intentions, products, providers and invalid product URL separate", async () => {
		clearReads()
		const request = new Request("https://fastt.test/product/tour/preview")
		await Promise.all([
			loadCompleteToPublishState({
				...input,
				request,
				selection: { variantId: "A", ratePlanId: "A-rate" },
			}),
			loadCompleteToPublishState({
				...input,
				request,
				selection: { variantId: "A", ratePlanId: "B-rate" },
			}),
			loadCompleteToPublishState({
				...input,
				request,
				productId: "other",
				selection: { variantId: "A", ratePlanId: "A-rate" },
			}),
			loadCompleteToPublishState({
				...input,
				request,
				providerId: "other",
				selection: { variantId: "A", ratePlanId: "A-rate" },
			}),
			loadCompleteToPublishState({
				...input,
				request,
				selection: { variantId: "A", ratePlanId: "A-rate" },
				url: new URL("https://fastt.test/?productId=foreign"),
			}),
		])
		expect(mocks.aggregate).toHaveBeenCalledTimes(5)
	})
	it("does not conflate fallback sessions when no explicit intent exists", async () => {
		clearReads()
		const request = new Request("https://fastt.test/product/tour/preview")
		await Promise.all(
			["A", "B"].map((id) =>
				loadCompleteToPublishState({
					...input,
					request,
					session: { variantId: id, ratePlanId: id + "-rate" },
				})
			)
		)
		expect(mocks.aggregate).toHaveBeenCalledTimes(2)
	})
	it("new requests, commands and requestless evaluations read afresh", async () => {
		clearReads()
		const request = new Request("https://fastt.test/api/activate", { method: "POST" })
		await loadCompleteToPublishState({ ...input, request })
		await loadCompleteToPublishState({ ...input, request })
		await loadCompleteToPublishState(input)
		await loadCompleteToPublishState(input)
		await loadCompleteToPublishState({
			...input,
			request: new Request("https://fastt.test/preview"),
		})
		mocks.commercial.mockResolvedValueOnce({ observations: { ...observations, priceReady: false } })
		const newer = await loadCompleteToPublishState({
			...input,
			request: new Request("https://fastt.test/preview"),
		})
		expect(newer!.tourDiagnostic!.requirements.price.result.state).toBe("pending")
		expect(mocks.commercial).toHaveBeenCalledTimes(6)
	})
	it("shares read failure within a page but retries in a new request", async () => {
		clearReads()
		mocks.commercial.mockRejectedValueOnce(new Error("offline"))
		const request = new Request("https://fastt.test/preview")
		const params = { ...input, request }
		const first = await loadCompleteToPublishState(params)
		expect(await loadCompleteToPublishState(params)).toBe(first)
		expect(first!.tourDiagnostic!.requirements.price.result.state).toBe("not_evaluable")
		const next = await loadCompleteToPublishState({ ...params, request: new Request(request) })
		expect(next!.tourDiagnostic!.requirements.price.result.state).toBe("ready")
		expect(mocks.commercial).toHaveBeenCalledTimes(2)
	})
})

describe("editorial state in both preparation guides", () => {
	it.each(["shared", "private"] as const)(
		"matches card and preview actions for a published %s",
		async (mode) => {
			const aggregate = await mocks.aggregate()
			mocks.aggregate.mockResolvedValue({ ...aggregate, status: "published" })
			const context = await mocks.context()
			mocks.context.mockResolvedValue({
				...context,
				option: { ...context.option, bookingMode: mode },
			})
			mocks.commercial.mockResolvedValue({
				observations: {
					...observations,
					availableDateCount: 0,
					futureDateCount: 2,
					futureCapacityDateCount: 2,
				},
			})
			const state = (await loadCompleteToPublishState(input))!
			const card = (await summarizeProductPreparation({ ...input, status: "published" }))!
			const preview = presentTourDiagnostic(state.tourDiagnostic!, {
				published: true,
				previewHref: card.previewHref,
			})
			const launch = (await evaluateTourLaunchProgress("tour", "provider"))!
			const complete = (await evaluateCompleteToPublishProgress("tour", "provider"))!
			expect(state.editorialStatus).toBe("published")
			for (const guide of [launch, complete]) {
				expect(guide.tourPresentation!.message).toBe(preview.message)
				expect(guide.tourPresentation!.nextRequirementId).toBe(preview.nextRequirementId)
				expect(guide.progress.progressPercent).toBe(100)
				if (mode === "shared") {
					expect(guide.tourPresentation!.primaryAction).toEqual(
						card.tourPresentation!.primaryAction
					)
					expect(guide.tourPresentation!.nextRequirementId).toBe("current_availability")
					const href = new URL(guide.tourPresentation!.primaryAction.href, "http://fastt.test")
					expect(href.searchParams.get("variantId")).toBe("option")
					expect(href.searchParams.get("ratePlanId")).toBe("rate")
				} else {
					expect(guide.tourPresentation!.message).toContain("solicitudes privadas habilitadas")
					expect(guide.tourPresentation!.nextRequirementId).toBeNull()
				}
			}
		}
	)
	it("does not turn a draft into a published operational flow or change progress through navigation", async () => {
		const aggregate = await mocks.aggregate()
		mocks.aggregate.mockResolvedValue({ ...aggregate, status: "draft" })
		mocks.commercial.mockResolvedValue({ observations: { ...observations, availableDateCount: 0 } })
		for (const step of ["content", "preview"]) {
			const launch = (await evaluateTourLaunchProgress("tour", "provider", {
				currentStepId: step,
			}))!
			const complete = (await evaluateCompleteToPublishProgress("tour", "provider", {
				currentStepId: step,
			}))!
			for (const guide of [launch, complete]) {
				expect(guide.tourPresentation!.nextRequirementId).toBeNull()
				expect(guide.tourPresentation!.message).not.toContain("Publicado")
				expect(guide.progress.progressPercent).toBe(100)
			}
		}
	})
})

it("preserves published editorial state while reporting incompatible conditions separately", async () => {
	mocks.commercial.mockResolvedValue({ observations: { ...observations, conditionsReady: false } })
	const summary = (await summarizeProductPreparation({ ...input, status: "published" }))!
	expect(summary.statusLabel).toBe("Publicado")
	expect(summary.statusVariant).toBe("success")
	expect(summary.readyToPublish).toBe(false)
	expect(summary.tourPresentation!.nextRequirementId).toBe("conditions")
	expect(summary.tourPresentation!.catalogStatus.prepared).toBe(false)
})

describe("guide and individual API parity through the real GET handler", () => {
	it.each(["published_sold_out", "published_private", "historical_ready_incompatible"])(
		"keeps diagnosis and corrective object identical for %s",
		async (scenario) => {
			const published = scenario !== "historical_ready_incompatible"
			const aggregate = await mocks.aggregate()
			mocks.aggregate.mockResolvedValue({
				...aggregate,
				id: "tour",
				status: published ? "published" : "ready",
			})
			if (scenario === "published_private") {
				const context = await mocks.context()
				mocks.context.mockResolvedValue({
					...context,
					option: { ...context.option, bookingMode: "private" },
				})
			}
			mocks.commercial.mockResolvedValue({
				observations: {
					...observations,
					availableDateCount: 0,
					conditionsReady: scenario !== "historical_ready_incompatible",
				},
			})
			const url = new URL(
				"https://fastt.test/api/internal/product-summary?productId=tour&variantId=option&ratePlanId=rate"
			)
			const request = new Request(url)
			const response = await productSummaryGET({ request, url } as Parameters<
				typeof productSummaryGET
			>[0])
			expect(response.status).toBe(200)
			expect(response.headers.get("Content-Type")).toBe("application/json")
			const body = await response.json()
			const state = (await loadCompleteToPublishState({ ...input, request, url }))!
			const card = (await summarizeProductPreparation({
				...input,
				status: published ? "published" : "ready",
				request,
				url,
			}))!
			const preview = presentTourDiagnostic(state.tourDiagnostic!, {
				published,
				previewHref: card.previewHref,
			})
			const launch = (await evaluateTourLaunchProgress("tour", "provider", {
				request,
				url,
				currentStepId: "preview",
			}))!
			const complete = (await evaluateCompleteToPublishProgress("tour", "provider", {
				request,
				url,
				currentStepId: "preview",
			}))!
			expect(body.productId).toBe("tour")
			expect(body.preparation.statusLabel).toBe(card.statusLabel)
			expect(body.preparation.isPublished).toBe(published)
			expect(body.preparation.readyToPublish).toBe(false)
			expect(body.progress.progressPercent).toBe(
				scenario === "historical_ready_incompatible" ? 91 : 100
			)
			for (const guide of [launch, complete]) {
				const presentation = guide.tourPresentation!
				expect(body.preparation.nextStepBody).toBe(presentation.support)
				expect(body.preparation.nextStepLabel).toBe(presentation.nextLabel)
				expect(body.preparation.nextStepCta).toBe(presentation.primaryAction.label)
				expect(body.preparation.continuePreparationHref).toBe(presentation.primaryAction.href)
				expect(presentation.primaryAction).toEqual(preview.primaryAction)
				expect(guide.progress.progressPercent).toBe(body.progress.progressPercent)
			}
			if (scenario === "published_private") {
				expect(body.preparation.nextStepBody).toContain("no confirma una reserva")
				expect(preview.nextRequirementId).toBeNull()
			} else {
				const expected = scenario === "published_sold_out" ? "current_availability" : "conditions"
				expect(preview.nextRequirementId).toBe(expected)
				const action = new URL(body.preparation.continuePreparationHref, url)
				expect(action.searchParams.get("variantId")).toBe("option")
				expect(action.searchParams.get("ratePlanId")).toBe("rate")
				expect(
					body.preparation.checks.find(
						(check: { sectionKey: string; complete: boolean }) =>
							check.sectionKey === (expected === "conditions" ? "bookingPolicies" : "calendar") &&
							!check.complete
					)
				).toBeDefined()
			}
			if (!published) expect(body.preparation.statusLabel).not.toBe("Listo para publicar")
		}
	)
})
