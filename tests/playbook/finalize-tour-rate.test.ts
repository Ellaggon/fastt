import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	activateTourRate: vi.fn(),
	loadState: vi.fn(),
	loadTourAuthorization: vi.fn(),
	getVariantById: vi.fn(),
	validateRatePlanPublication: vi.fn(),
	getRatePlanById: vi.fn(),
	resolveRatePlanOwnerContext: vi.fn(),
	invalidateAggregateCache: vi.fn(),
	invalidateVariant: vi.fn(),
	invalidatePricing: vi.fn(),
	invalidateCalendarSurface: vi.fn(),
	invalidateProvider: vi.fn(),
	assertProviderCapability: vi.fn(),
	evaluateVariantReadiness: vi.fn(),
}))

vi.mock("@/lib/playbook/evaluate-complete-to-publish-progress", () => ({
	loadCompleteToPublishState: mocks.loadState,
}))

vi.mock("@/lib/auth/requireProvider", () => ({
	requireProvider: async () => ({ providerId: "provider-1", user: { id: "user-1" } }),
}))

vi.mock("@/container", () => ({
	ratePlanCommandRepository: { activateTourRate: mocks.activateTourRate },
	variantManagementRepository: { getVariantById: mocks.getVariantById },
	ratePlanPricingReadRepository: {},
}))
vi.mock("@/modules/catalog/public", () => ({
	evaluateVariantReadiness: mocks.evaluateVariantReadiness,
}))
vi.mock("@/lib/rates/validateRatePlanPublication", () => ({
	validateRatePlanPublication: mocks.validateRatePlanPublication,
}))
vi.mock("@/lib/provider-governance", () => ({
	assertProviderCapability: mocks.assertProviderCapability,
}))
vi.mock("@/modules/pricing/public", () => ({
	getRatePlanById: mocks.getRatePlanById,
	resolveRatePlanOwnerContext: mocks.resolveRatePlanOwnerContext,
}))
vi.mock("@/lib/cache/ssrAggregateCache", () => ({
	invalidateAggregateCache: mocks.invalidateAggregateCache,
}))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateVariant: mocks.invalidateVariant,
	invalidatePricing: mocks.invalidatePricing,
	invalidateCalendarSurface: mocks.invalidateCalendarSurface,
	invalidateProvider: mocks.invalidateProvider,
}))

import { buildTourDiagnostic } from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"
import { POST } from "@/pages/api/rateplans/activate-guided"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { finalizeTourRate } from "@/lib/playbook/finalize-tour-rate"

const input = {
	providerId: "provider-1",
	userId: "user-1",
	productId: "product-1",
	variantId: "slot-1",
	ratePlanId: "rate-1",
	playbook: "complete-to-publish" as const,
}

describe("finalize tour rate", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.loadState.mockImplementation(async () => {
			const publication = await mocks.validateRatePlanPublication()
			const authorization = await mocks.loadTourAuthorization()
			const observations = Object.fromEntries(
				Object.keys(TOUR_REQUIREMENTS).map((id) => [id, { ready: true, message: "" }])
			)
			Object.assign(observations, authorization)
			if (!publication.canPublish)
				for (const blocker of publication.blockerDetails ??
					publication.blockers.map((label: string) => ({ id: "current_availability", label })))
					observations[blocker.id] = { ready: false, message: blocker.label }
			return {
				tourDiagnostic: buildTourDiagnostic({
					providerId: input.providerId,
					productId: input.productId,
					context: resolveTourCommercialContext({
						productId: input.productId,
						options: [
							{
								variantId: input.variantId,
								name: "Salida",
								bookingMode: "shared",
								lifecycleState: "ready",
								salesEnabled: false,
								hasProfile: true,
								hasCapacity: true,
								rates: [
									{
										ratePlanId: input.ratePlanId,
										name: "Tarifa",
										isActive: false,
										isDefault: false,
									},
								],
							},
						],
					}),
					observations: observations as Parameters<typeof buildTourDiagnostic>[0]["observations"],
				}),
			}
		})
		mocks.loadTourAuthorization.mockResolvedValue({
			provider_authorization: { ready: true, message: "" },
			experience_authorization: { ready: true, message: "" },
		})
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "slot-1",
			productType: "tour",
		})
		mocks.getRatePlanById.mockResolvedValue({
			name: "Estándar",
			description: null,
			isActive: false,
			isDefault: false,
		})
		mocks.getVariantById.mockResolvedValue({
			id: "slot-1",
			productId: "product-1",
			kind: "tour_slot",
			lifecycleState: "ready",
			salesEnabled: false,
		})
		mocks.validateRatePlanPublication.mockResolvedValue({ canPublish: true, blockers: [] })
		mocks.activateTourRate.mockResolvedValue("activated")
		mocks.assertProviderCapability.mockResolvedValue(undefined)
		mocks.evaluateVariantReadiness.mockResolvedValue({
			variantId: "slot-1",
			lifecycleState: "ready",
			validationErrors: [],
		})
		mocks.invalidateVariant.mockResolvedValue(undefined)
		mocks.invalidatePricing.mockResolvedValue(undefined)
		mocks.invalidateCalendarSurface.mockResolvedValue(undefined)
		mocks.invalidateProvider.mockResolvedValue(undefined)
	})

	it("returns exact authorization blockers before any activation write", async () => {
		mocks.loadTourAuthorization.mockResolvedValue({
			provider_authorization: { ready: true, message: "" },
			experience_authorization: {
				ready: false,
				message: "Licencia pendiente",
				action: { label: "Revisar licencia", href: "/provider/settings/verification?tab=licenses" },
			},
		})
		const result = await finalizeTourRate(input)
		expect(result.ok).toBe(false)
		expect(result).toMatchObject({
			status: 409,
			blockers: [
				{
					id: "experience_authorization",
					label: "Licencia pendiente",
					href: expect.stringContaining("returnTo="),
				},
			],
		})
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
	})

	it.each([
		"price",
		"conditions",
		"current_availability",
		"experience_authorization",
		"read_failed",
	])("endpoint matches the visible activation decision for %s", async (scenario) => {
		if (scenario === "experience_authorization")
			mocks.loadTourAuthorization.mockResolvedValue({
				provider_authorization: { ready: true, message: "" },
				experience_authorization: {
					ready: false,
					message: "Renueva la licencia",
					responsible: "provider",
					action: {
						label: "Renovar licencia",
						href: "/provider/settings/verification?tourTab=licenses",
					},
				},
			})
		else if (scenario !== "read_failed")
			mocks.validateRatePlanPublication.mockResolvedValue({
				canPublish: false,
				blockerDetails: [{ id: scenario, label: "Corrige este requisito" }],
			})
		const state = await mocks.loadState()
		if (scenario === "read_failed")
			state.tourDiagnostic.requirements.price.result = {
				state: "not_evaluable",
				reason: { code: "read_failed", message: "No se pudo verificar precio" },
				responsible: "fastt",
				action: {
					label: "Volver a intentar",
					href: "/product/product-1/preview?variantId=slot-1&ratePlanId=rate-1",
				},
			}
		mocks.loadState.mockResolvedValue(state)
		const visible = presentTourDiagnostic(state.tourDiagnostic, {
			previewHref: "/product/product-1/preview",
		}).activation
		const response = await POST({
			request: new Request("https://fastt.test/api/rateplans/activate-guided", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			}),
		} as Parameters<typeof POST>[0])
		const payload = await response.json()
		expect(response.status).toBe(409)
		expect(visible.allowed).toBe(false)
		expect(payload.capability).toBe(visible.capability)
		expect(payload.source).toBe(visible.source)
		expect(payload.blockers).toEqual(visible.blockers)
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
		if (scenario === "experience_authorization") {
			const target = new URL(payload.blockers[0].href, "https://fastt.test")
			expect(target.searchParams.get("tourTab")).toBe("licenses")
			const back = new URL(target.searchParams.get("returnTo")!, target)
			expect(back.searchParams.get("variantId")).toBe("slot-1")
			expect(back.searchParams.get("ratePlanId")).toBe("rate-1")
		}
	})

	it.each(["shared", "private"] as const)(
		"respects %s activation without requiring editorial completion",
		async (mode) => {
			const state = await mocks.loadState()
			state.tourDiagnostic.context.selection.bookingMode = mode
			state.tourDiagnostic.requirements.photos.result = {
				state: "pending",
				reason: { code: "photos", message: "Agrega fotos" },
				responsible: "provider",
				action: { label: "Editar fotos", href: "/product/product-1/images" },
			}
			state.tourDiagnostic.requirements.current_availability.result =
				mode === "private"
					? {
							state: "not_applicable",
							reason: {
								code: "private_request_without_inventory",
								message: "No consume inventario compartido",
							},
							applicabilityReference: "tour-diagnostic-v1:private-request-without-hold",
						}
					: {
							state: "pending",
							reason: { code: "sold_out", message: "Cupos agotados" },
							responsible: "provider",
							action: {
								label: "Revisar disponibilidad",
								href: "/rates/calendar?productId=product-1&variantId=slot-1&ratePlanId=rate-1",
							},
						}
			mocks.loadState.mockResolvedValue(state)
			const visible = presentTourDiagnostic(state.tourDiagnostic, {
				previewHref: "/product/product-1/preview",
			}).activation
			expect(visible.allowed).toBe(mode === "private")
			const result = await finalizeTourRate(input)
			expect(result.ok).toBe(visible.allowed)
			if (!result.ok) expect(result).toMatchObject({ blockers: visible.blockers })
		}
	)

	it("activates the rate after availability without waiting for provider publication setup", async () => {
		const result = await finalizeTourRate(input)

		expect(result.ok).toBe(true)
		expect(mocks.activateTourRate).toHaveBeenCalledWith(
			expect.objectContaining({
				ratePlanId: "rate-1",
				variantId: "slot-1",
				productId: "product-1",
				providerId: "provider-1",
			})
		)
		expect(mocks.evaluateVariantReadiness).toHaveBeenCalledWith(expect.anything(), {
			variantId: "slot-1",
			ratePlanId: "rate-1",
		})
		if (result.ok) {
			const terminalUrl = new URL(result.terminalHref, "https://fastt.test")
			expect(terminalUrl.searchParams.get("playbook")).toBe("complete-to-publish")
			expect(terminalUrl.searchParams.get("variantId")).toBe("slot-1")
			expect(terminalUrl.searchParams.get("ratePlanId")).toBe("rate-1")
		}
	})

	it("preserves the selected option and rate in the launch-tour review URL", async () => {
		const result = await finalizeTourRate({ ...input, playbook: "launch-tour" })

		expect(result.ok).toBe(true)
		if (!result.ok) return

		const terminalUrl = new URL(result.terminalHref, "https://fastt.test")
		expect(terminalUrl.searchParams.get("playbook")).toBe("launch-tour")
		expect(terminalUrl.searchParams.get("variantId")).toBe("slot-1")
		expect(terminalUrl.searchParams.get("ratePlanId")).toBe("rate-1")
	})

	it("keeps the commercial blockers when the departure is not ready", async () => {
		mocks.validateRatePlanPublication.mockResolvedValue({
			canPublish: false,
			blockers: ["disponibilidad"],
		})

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({
			ok: false,
			status: 409,
			blockers: [expect.objectContaining({ label: "disponibilidad", href: expect.any(String) })],
		})
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
	})

	it("returns actionable commercial diagnostics with the selected rate", async () => {
		mocks.validateRatePlanPublication.mockResolvedValue({
			canPublish: false,
			blockers: ["Precio pendiente", "Condiciones pendientes"],
			blockerDetails: [
				{ id: "price", label: "Precio pendiente" },
				{ id: "conditions", label: "Condiciones pendientes" },
			],
		})
		const result = await finalizeTourRate(input)
		expect(result).toMatchObject({
			ok: false,
			status: 409,
			blockers: [
				{ id: "price", label: "Precio pendiente", href: expect.stringContaining("vista=price") },
				{
					id: "conditions",
					label: "Condiciones pendientes",
					href: expect.stringContaining("vista=conditions"),
				},
			],
		})
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
	})

	it("does not activate or report success when variant readiness is incomplete", async () => {
		mocks.evaluateVariantReadiness.mockResolvedValue({
			variantId: "slot-1",
			lifecycleState: "draft",
			validationErrors: [
				{ code: "missing_tour_slot_profile", message: "Completa la salida." },
				{ code: "inventory_missing", message: "Inventory not configured (reserved for CAPA 5)" },
			],
		})

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({
			ok: false,
			status: 409,
			blockers: [
				expect.objectContaining({
					label: "Completa el horario, idioma y grupo de esta salida.",
					href: expect.any(String),
				}),
			],
		})
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
	})

	it("propagates an activation transaction failure instead of returning success", async () => {
		mocks.activateTourRate.mockRejectedValue(new Error("activation write failed"))

		await expect(finalizeTourRate(input)).rejects.toThrow("activation write failed")
	})

	it("returns committed activation on retry even if readiness has changed", async () => {
		mocks.getRatePlanById.mockResolvedValue({
			name: "Estándar",
			description: null,
			isActive: true,
			isDefault: true,
		})
		mocks.getVariantById.mockResolvedValue({
			id: "slot-1",
			productId: "product-1",
			kind: "tour_slot",
			lifecycleState: "ready",
			salesEnabled: true,
		})
		mocks.validateRatePlanPublication.mockResolvedValue({
			canPublish: false,
			blockers: ["changed"],
		})

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({ ok: true, alreadyActive: true, cacheRefreshPending: false })
		expect(mocks.validateRatePlanPublication).not.toHaveBeenCalled()
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
		expect(mocks.assertProviderCapability).toHaveBeenCalledWith({
			providerId: "provider-1",
			currentUserId: "user-1",
			capability: "publish",
		})
	})

	it("still checks publish capability before revealing a committed activation", async () => {
		mocks.getRatePlanById.mockResolvedValue({
			name: "Estándar",
			description: null,
			isActive: true,
			isDefault: true,
		})
		mocks.getVariantById.mockResolvedValue({
			id: "slot-1",
			productId: "product-1",
			kind: "tour_slot",
			lifecycleState: "ready",
			salesEnabled: true,
		})
		mocks.assertProviderCapability.mockRejectedValue(new Error("publish blocked"))

		await expect(finalizeTourRate(input)).rejects.toThrow("publish blocked")
		expect(mocks.invalidateVariant).not.toHaveBeenCalled()
		expect(mocks.activateTourRate).not.toHaveBeenCalled()
	})

	it("does not report a cache invalidation failure as a failed database activation", async () => {
		mocks.invalidateVariant.mockRejectedValue(new Error("cache unavailable"))
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({ ok: true, alreadyActive: false, cacheRefreshPending: true })
		expect(error).toHaveBeenCalled()
		error.mockRestore()
	})

	it("does not report success when the atomic repository rechecks an unready departure", async () => {
		mocks.activateTourRate.mockResolvedValue("not_ready")
		mocks.evaluateVariantReadiness
			.mockResolvedValueOnce({
				variantId: "slot-1",
				lifecycleState: "ready",
				validationErrors: [],
			})
			.mockResolvedValueOnce({
				variantId: "slot-1",
				lifecycleState: "draft",
				validationErrors: [
					{ code: "missing_profile", message: "Completa el perfil de la salida." },
				],
			})

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({
			ok: false,
			status: 409,
			blockers: [
				expect.objectContaining({
					label: "Completa el perfil de la salida.",
					href: expect.any(String),
				}),
			],
		})
		expect(mocks.invalidateVariant).not.toHaveBeenCalled()
	})
})
