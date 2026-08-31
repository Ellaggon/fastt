import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	getCanonicalPricingBaselineByRatePlanId: vi.fn(),
	getByVariantId: vi.fn(),
	resolveEffectivePolicies: vi.fn(),
	select: vi.fn(),
	where: vi.fn(),
	gt: vi.fn(),
}))

vi.mock("@/container", () => ({
	baseRateRepository: {
		getCanonicalPricingBaselineByRatePlanId: mocks.getCanonicalPricingBaselineByRatePlanId,
	},
	variantInventoryConfigRepository: { getByVariantId: mocks.getByVariantId },
}))
vi.mock("@/modules/policies/public", () => ({
	REQUIRED_POLICY_CATEGORIES: ["cancellation", "payment"],
	resolveEffectivePolicies: mocks.resolveEffectivePolicies,
}))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	DailyInventory: { date: "date", variantId: "variantId", totalInventory: "totalInventory" },
	and: vi.fn(),
	count: vi.fn(),
	eq: vi.fn(),
	gt: mocks.gt,
	db: {
		select: mocks.select,
	},
}))

import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"

describe("validate rate plan publication", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getCanonicalPricingBaselineByRatePlanId.mockResolvedValue({ basePrice: 120 })
		mocks.getByVariantId.mockResolvedValue({ defaultTotalUnits: 1 })
		mocks.resolveEffectivePolicies.mockResolvedValue({ missingCategories: [] })
		mocks.select.mockReturnValue({
			from: () => ({ where: mocks.where }),
		})
		mocks.where.mockResolvedValue([{ value: 30 }])
	})

	it("allows activation with a base price, physical capacity, required policies and 30 nights", async () => {
		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result).toEqual({ canPublish: true, blockers: [] })
		expect(mocks.gt).toHaveBeenCalledWith("date", expect.any(String))
	})

	it("blocks activation below the sellable availability threshold", async () => {
		mocks.where.mockResolvedValue([{ value: 29 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result).toEqual({
			canPublish: false,
			blockers: ["30 noches con disponibilidad"],
		})
	})

	it("keeps policy and physical-capacity blockers explicit", async () => {
		mocks.getByVariantId.mockResolvedValue({ defaultTotalUnits: 0 })
		mocks.resolveEffectivePolicies.mockResolvedValue({ missingCategories: ["payment"] })

		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result.blockers).toEqual(["cupo físico", "condiciones obligatorias"])
	})
})
