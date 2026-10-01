import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	getCanonicalPricingBaselineByRatePlanId: vi.fn(),
	getByVariantId: vi.fn(),
	resolveEffectivePolicies: vi.fn(),
	select: vi.fn(),
	capacityWhere: vi.fn(),
	capacityTable: { variantId: "capacity.variantId" },
	inventoryWhere: vi.fn(),
	productWhere: vi.fn(),
	eq: vi.fn(),
	gt: vi.fn(),
	lt: vi.fn(),
	productTable: { id: "product.id", productType: "product.productType" },
	dailyInventoryTable: {
		date: "date",
		variantId: "variantId",
		totalInventory: "totalInventory",
		reservedCount: "reservedCount",
	},
}))

vi.mock("@/lib/rates/providerLocalToday", () => ({
	providerLocalToday: () => "2026-09-30",
	providerLocalTimezone: () => "America/La_Paz",
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
	DailyInventory: mocks.dailyInventoryTable,
	VariantCapacity: mocks.capacityTable,
	TourSlotProfile: { variantId: "profile.variantId", bookingMode: "profile.mode" },
	Product: mocks.productTable,
	and: vi.fn((...conditions: unknown[]) => conditions),
	count: vi.fn(),
	eq: vi.fn(),
	first: (rows: unknown[]) => rows[0],
	gt: mocks.gt,
	lt: mocks.lt,
	db: {
		select: mocks.select,
	},
}))

import { validateRatePlanPublication } from "@/lib/rates/validateRatePlanPublication"

describe("validate rate plan publication", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getCanonicalPricingBaselineByRatePlanId.mockResolvedValue({
			basePrice: 120,
			currency: "BOB",
		})
		mocks.getByVariantId.mockResolvedValue({ defaultTotalUnits: 1 })
		mocks.resolveEffectivePolicies.mockResolvedValue({ missingCategories: [] })
		mocks.gt.mockImplementation((...args: unknown[]) => ["gt", ...args])
		mocks.lt.mockImplementation((...args: unknown[]) => ["lt", ...args])
		mocks.eq.mockImplementation((...args: unknown[]) => ["eq", ...args])
		mocks.select.mockImplementation(() => ({
			from: (table: unknown) => ({
				leftJoin() {
					return this
				},
				where:
					table === mocks.productTable
						? mocks.productWhere
						: table === mocks.capacityTable
							? mocks.capacityWhere
							: mocks.inventoryWhere,
			}),
		}))
		mocks.capacityWhere.mockResolvedValue([{ maxOccupancy: 8 }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 30 }])
		mocks.productWhere.mockResolvedValue([{ productType: "hotel" }])
	})

	it("allows activation with a base price, physical capacity, required policies and 30 nights", async () => {
		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result).toMatchObject({ canPublish: true, blockers: [] })
		expect(mocks.gt).toHaveBeenCalledWith("date", expect.any(String))
		expect(mocks.gt).toHaveBeenCalledWith("totalInventory", 0)
		expect(mocks.lt).toHaveBeenCalledWith("reservedCount", "totalInventory")
		expect(JSON.stringify(mocks.inventoryWhere.mock.calls[0]?.[0])).toContain(
			JSON.stringify(["lt", "reservedCount", "totalInventory"])
		)
	})

	it("blocks activation below the sellable availability threshold", async () => {
		mocks.inventoryWhere.mockResolvedValue([{ value: 29 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result).toMatchObject({
			canPublish: false,
			blockers: ["Configura al menos 30 noches con disponibilidad."],
		})
	})

	it("keeps policy and physical-capacity blockers explicit", async () => {
		mocks.getByVariantId.mockResolvedValue({ defaultTotalUnits: 0 })
		mocks.resolveEffectivePolicies.mockResolvedValue({ missingCategories: ["Payment"] })

		const result = await validateRatePlanPublication({
			ratePlanId: "rate-1",
			variantId: "room-1",
			productId: "product-1",
		})

		expect(result.blockers).toEqual([
			"Define cuántas unidades físicas tiene esta habitación.",
			"Completa las condiciones pendientes: Pago.",
		])
	})

	it("requires tour policies only and accepts one future departure", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 1 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "tour-rate-1",
			variantId: "tour-slot-1",
			productId: "tour-1",
		})

		expect(result).toMatchObject({ canPublish: true, blockers: [] })
		expect(mocks.lt).toHaveBeenCalledWith("reservedCount", "totalInventory")
		expect(mocks.resolveEffectivePolicies).toHaveBeenCalledWith(
			expect.objectContaining({
				requiredCategories: ["Cancellation", "Payment", "NoShow"],
			})
		)
	})

	it("does not treat a fully reserved future tour departure as sellable", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 0 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "tour-rate-1",
			variantId: "tour-slot-1",
			productId: "tour-1",
		})

		expect(result).toMatchObject({
			canPublish: false,
			blockers: ["Abre al menos una fecha futura con cupo para esta salida."],
		})
		expect(mocks.lt).toHaveBeenCalledWith("reservedCount", "totalInventory")
	})

	it("returns the exact tour policy categories that prevent activation", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 1 }])
		mocks.resolveEffectivePolicies.mockResolvedValue({
			missingCategories: ["Cancellation", "NoShow"],
		})

		const result = await validateRatePlanPublication({
			ratePlanId: "tour-rate-1",
			variantId: "tour-slot-1",
			productId: "tour-1",
		})

		expect(result.blockers).toEqual([
			"Completa las condiciones pendientes: Cancelación, No presentación.",
		])
	})

	it("explains the missing price, capacity and date before a tour can activate", async () => {
		mocks.getCanonicalPricingBaselineByRatePlanId.mockResolvedValue(null)
		mocks.getByVariantId.mockResolvedValue({ defaultTotalUnits: 0 })
		mocks.capacityWhere.mockResolvedValue([{ maxOccupancy: 0 }])
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.inventoryWhere.mockResolvedValue([{ value: 0 }])

		const result = await validateRatePlanPublication({
			ratePlanId: "tour-rate-1",
			variantId: "tour-slot-1",
			productId: "tour-1",
		})

		expect(result.blockers).toEqual([
			"Define un precio base mayor que cero.",
			"Define el cupo físico de esta salida.",
			"Abre al menos una fecha futura con cupo para esta salida.",
		])
		expect(result.blockerDetails.map((blocker) => blocker.id)).toEqual([
			"price",
			"capacity",
			"availability",
		])
	})

	it("private options require configured dates but do not consume shared sellable inventory", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.capacityWhere.mockResolvedValue([{ maxOccupancy: 8, bookingMode: "private" }])
		mocks.inventoryWhere.mockResolvedValueOnce([{ value: 0 }]).mockResolvedValueOnce([{ value: 2 }])
		const result = await validateRatePlanPublication({
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(result.canPublish).toBe(true)
		expect(result.observations.availableDateCount).toBe(0)
		expect(result.observations.configuredDateCount).toBe(2)
	})

	it("rejects an effective hotel policy on the selected tour rate", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "tour" }])
		mocks.resolveEffectivePolicies.mockResolvedValue({
			missingCategories: [],
			policies: [
				{
					category: "Cancellation",
					policy: {
						stayLengthType: "long_stay",
						refundBasis: "first_night",
						rules: [],
						cancellationTiers: [],
					},
				},
			],
		})
		const result = await validateRatePlanPublication({
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(result.observations.conditionsReady).toBe(false)
		expect(result.blockerDetails.some((blocker) => blocker.id === "conditions")).toBe(true)
	})

	it("fails closed when a product has no policy contract", async () => {
		mocks.productWhere.mockResolvedValue([{ productType: "unknown_vertical" }])

		const result = await validateRatePlanPublication({
			ratePlanId: "unknown-rate-1",
			variantId: "unknown-slot-1",
			productId: "unknown-1",
		})

		expect(result.canPublish).toBe(false)
		expect(result.blockers).toContain(
			"Fastt aún no definió las condiciones para este tipo de oferta."
		)
		expect(mocks.resolveEffectivePolicies).not.toHaveBeenCalled()
	})
})
