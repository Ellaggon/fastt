import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	getCanonicalPricingBaselineByRatePlanId: vi.fn(),
	getByVariantId: vi.fn(),
	resolveEffectivePolicies: vi.fn(),
	select: vi.fn(),
	inventoryWhere: vi.fn(),
	productWhere: vi.fn(),
	gt: vi.fn(),
	productTable: { id: "product.id", productType: "product.productType" },
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
	Product: mocks.productTable,
	and: vi.fn(),
	count: vi.fn(),
	eq: vi.fn(),
	first: (rows: unknown[]) => rows[0],
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
		mocks.select.mockImplementation(() => ({
			from: (table: unknown) => ({
				where: table === mocks.productTable ? mocks.productWhere : mocks.inventoryWhere,
			}),
		}))
		mocks.inventoryWhere.mockResolvedValue([{ value: 30 }])
		mocks.productWhere.mockResolvedValue([{ productType: "hotel" }])
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
		mocks.inventoryWhere.mockResolvedValue([{ value: 29 }])

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

	it("requires tour policies only and accepts one future departure", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 1 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "tour-rate-1",
			variantId: "tour-slot-1",
			productId: "tour-1",
		})

		expect(result).toEqual({ canPublish: true, blockers: [] })
		expect(mocks.resolveEffectivePolicies).toHaveBeenCalledWith(
			expect.objectContaining({
				requiredCategories: ["Cancellation", "Payment", "NoShow"],
			})
		)
	})

	it("fails closed when a product has no policy contract", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "unknown_vertical" }])

		const result = await validateRatePlanPublication({
			ratePlanId: "unknown-rate-1",
			variantId: "unknown-slot-1",
			productId: "unknown-1",
		})

		expect(result.canPublish).toBe(false)
		expect(result.blockers).toContain("contrato de políticas no definido")
		expect(mocks.resolveEffectivePolicies).not.toHaveBeenCalled()
	})
})
