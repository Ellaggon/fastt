import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	updateRatePlan: vi.fn(),
	loadVariantCompletion: vi.fn(),
	assertProviderCapability: vi.fn(),
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
vi.mock("@/lib/playbook/evaluate-add-room-progress", () => ({
	loadVariantCompletion: mocks.loadVariantCompletion,
}))
vi.mock("@/lib/provider-governance", () => ({
	assertProviderCapability: mocks.assertProviderCapability,
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

import { finalizeAddRoom } from "@/lib/playbook/finalize-add-room"

const input = {
	providerId: "provider-1",
	userId: "user-1",
	productId: "product-1",
	variantId: "room-1",
	ratePlanId: "rate-1",
}

function completion(overrides: Record<string, unknown> = {}) {
	return {
		profileComplete: true,
		photosComplete: true,
		rateConfigured: true,
		rateActive: false,
		rateDefault: false,
		pricingComplete: true,
		conditionsComplete: true,
		inventoryConfigComplete: true,
		availabilityComplete: true,
		setupComplete: true,
		sellable: false,
		selectedRatePlanId: "rate-1",
		...overrides,
	}
}

describe("finalize add-room", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-1",
			productId: "product-1",
			variantId: "room-1",
		})
		mocks.getRatePlanById.mockResolvedValue({
			name: "Flexible",
			description: null,
			isActive: false,
		})
		mocks.loadVariantCompletion.mockResolvedValue(completion())
		mocks.validateRatePlanPublication.mockResolvedValue({ canPublish: true, blockers: [] })
		mocks.updateRatePlan.mockResolvedValue("updated")
		mocks.assertProviderCapability.mockResolvedValue(undefined)
		mocks.invalidateVariant.mockResolvedValue(undefined)
		mocks.invalidatePricing.mockResolvedValue(undefined)
		mocks.invalidateCalendarSurface.mockResolvedValue(undefined)
		mocks.invalidateProvider.mockResolvedValue(undefined)
	})

	it("activates the selected rate, makes it principal and returns the terminal URL", async () => {
		const result = await finalizeAddRoom(input)

		expect(result).toMatchObject({ ok: true, ratePlanId: "rate-1" })
		if (result.ok) {
			expect(result.terminalHref).toContain("variantId=room-1")
			expect(result.terminalHref).toContain("ratePlanId=rate-1")
		}
		expect(mocks.updateRatePlan).toHaveBeenCalledWith(
			expect.objectContaining({ ratePlanId: "rate-1", isActive: true, isDefault: true })
		)
		expect(mocks.invalidateCalendarSurface).toHaveBeenCalled()
	})

	it.each([
		[completion({ profileComplete: false, inventoryConfigComplete: false }), "unidades físicas"],
		[completion({ availabilityComplete: false }), "30 noches"],
		[completion({ conditionsComplete: false }), "condiciones"],
	])("blocks finalization when %s is incomplete", async (state, label) => {
		mocks.loadVariantCompletion.mockResolvedValue(state)

		const result = await finalizeAddRoom(input)

		expect(result).toMatchObject({ ok: false, status: 409 })
		if (!result.ok) expect(result.blockers?.join(" ")).toContain(label)
		expect(mocks.updateRatePlan).not.toHaveBeenCalled()
	})

	it("is idempotent after the selected rate is already active", async () => {
		mocks.getRatePlanById.mockResolvedValue({ name: "Flexible", description: null, isActive: true })

		const first = await finalizeAddRoom(input)
		const second = await finalizeAddRoom(input)

		expect(first.ok).toBe(true)
		expect(second.ok).toBe(true)
		expect(mocks.assertProviderCapability).not.toHaveBeenCalled()
		expect(mocks.updateRatePlan).toHaveBeenCalledTimes(2)
	})

	it("rejects a rate plan that belongs to another provider", async () => {
		mocks.resolveRatePlanOwnerContext.mockResolvedValue({
			providerId: "provider-2",
			productId: "product-2",
			variantId: "room-2",
		})

		const result = await finalizeAddRoom(input)

		expect(result).toEqual({
			ok: false,
			status: 404,
			error: "Tarifa, habitación o alojamiento no encontrado.",
		})
	})
})
