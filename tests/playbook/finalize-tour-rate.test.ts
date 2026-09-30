import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	activateTourRate: vi.fn(),
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
