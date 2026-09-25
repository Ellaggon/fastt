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
}))

vi.mock("@/container", () => ({
	ratePlanCommandRepository: { updateRatePlan: mocks.updateRatePlan },
}))
vi.mock("@/lib/rates/validateRatePlanPublication", () => ({
	validateRatePlanPublication: mocks.validateRatePlanPublication,
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
})
