import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	updateRatePlan: vi.fn(),
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
	setVariantSalesEnabled: vi.fn(),
}))

vi.mock("@/container", () => ({
	ratePlanCommandRepository: { updateRatePlan: mocks.updateRatePlan },
	variantManagementRepository: {},
	ratePlanPricingReadRepository: {},
}))
vi.mock("@/modules/catalog/public", () => ({
	evaluateVariantReadiness: mocks.evaluateVariantReadiness,
	setVariantSalesEnabled: mocks.setVariantSalesEnabled,
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
		})
		mocks.getRatePlanById.mockResolvedValue({
			name: "Estándar",
			description: null,
			isActive: false,
		})
		mocks.validateRatePlanPublication.mockResolvedValue({ canPublish: true, blockers: [] })
		mocks.updateRatePlan.mockResolvedValue("updated")
		mocks.assertProviderCapability.mockResolvedValue(undefined)
		mocks.evaluateVariantReadiness.mockResolvedValue({
			variantId: "slot-1",
			lifecycleState: "ready",
			validationErrors: [],
		})
		mocks.setVariantSalesEnabled.mockResolvedValue({ variantId: "slot-1", salesEnabled: true })
		mocks.invalidateVariant.mockResolvedValue(undefined)
		mocks.invalidatePricing.mockResolvedValue(undefined)
		mocks.invalidateCalendarSurface.mockResolvedValue(undefined)
		mocks.invalidateProvider.mockResolvedValue(undefined)
	})

	it("activates the rate after availability without waiting for provider publication setup", async () => {
		const result = await finalizeTourRate(input)

		expect(result.ok).toBe(true)
		expect(mocks.updateRatePlan).toHaveBeenCalledWith(
			expect.objectContaining({ ratePlanId: "rate-1", isActive: true, isDefault: true })
		)
		expect(mocks.evaluateVariantReadiness).toHaveBeenCalledWith(expect.anything(), {
			variantId: "slot-1",
			ratePlanId: "rate-1",
		})
		expect(mocks.setVariantSalesEnabled).toHaveBeenCalledWith(expect.anything(), {
			variantId: "slot-1",
			salesEnabled: true,
		})
		if (result.ok) expect(result.terminalHref).toContain("playbook=complete-to-publish")
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
			blockers: ["disponibilidad"],
		})
		expect(mocks.updateRatePlan).not.toHaveBeenCalled()
	})

	it("does not activate or report success when variant readiness is incomplete", async () => {
		mocks.evaluateVariantReadiness.mockResolvedValue({
			variantId: "slot-1",
			lifecycleState: "draft",
			validationErrors: [{ code: "missing_tour_slot_profile", message: "Completa la salida." }],
		})

		const result = await finalizeTourRate(input)

		expect(result).toMatchObject({
			ok: false,
			status: 409,
			blockers: ["Completa la salida."],
		})
		expect(mocks.updateRatePlan).not.toHaveBeenCalled()
		expect(mocks.setVariantSalesEnabled).not.toHaveBeenCalled()
	})

	it("propagates a sales enablement failure instead of returning success", async () => {
		mocks.setVariantSalesEnabled.mockRejectedValue(new Error("sales write failed"))

		await expect(finalizeTourRate(input)).rejects.toThrow("sales write failed")
	})

	it("checks publish capability even when re-enabling a previously active rate", async () => {
		mocks.getRatePlanById.mockResolvedValue({
			name: "Estándar",
			description: null,
			isActive: true,
		})

		const result = await finalizeTourRate(input)

		expect(result.ok).toBe(true)
		expect(mocks.assertProviderCapability).toHaveBeenCalledWith({
			providerId: "provider-1",
			currentUserId: "user-1",
			capability: "publish",
		})
	})
})
