import { beforeEach, describe, expect, it, vi } from "vitest"

const { selectMock, getMock, andMock, eqMock, lteMock, gteMock, ascMock } = vi.hoisted(() => ({
	selectMock: vi.fn(),
	getMock: vi.fn(),
	andMock: vi.fn((...args: any[]) => ({ and: args })),
	eqMock: vi.fn((...args: any[]) => ({ eq: args })),
	lteMock: vi.fn((...args: any[]) => ({ lte: args })),
	gteMock: vi.fn((...args: any[]) => ({ gte: args })),
	ascMock: vi.fn((...args: any[]) => ({ asc: args })),
}))

vi.mock("astro:db", () => ({
	db: {
		select: selectMock,
	},
	and: andMock,
	eq: eqMock,
	gte: gteMock,
	lte: lteMock,
	lt: vi.fn(),
	asc: ascMock,
	RatePlanOccupancyPolicy: {
		ratePlanId: "ratePlanId",
		effectiveFrom: "effectiveFrom",
		effectiveTo: "effectiveTo",
		baseAmount: "baseAmount",
		baseCurrency: "baseCurrency",
		baseAdults: "baseAdults",
		baseChildren: "baseChildren",
		extraAdultMode: "extraAdultMode",
		extraAdultValue: "extraAdultValue",
		childMode: "childMode",
		childValue: "childValue",
		currency: "currency",
	},
	EffectivePricing: {
		variantId: "variantId",
		ratePlanId: "ratePlanId",
		date: "date",
		basePrice: "basePrice",
	},
	EffectivePricingV2: {
		id: "id",
		variantId: "variantId",
		ratePlanId: "ratePlanId",
		date: "date",
		occupancyKey: "occupancyKey",
	},
}))

import { PricingV2Repository } from "@/modules/pricing/infrastructure/repositories/PricingV2Repository"

function wireSelectPipeline(result: any) {
	getMock.mockResolvedValue(result)
	const orderBy = vi.fn(() => ({ get: getMock }))
	const where = vi.fn(() => ({ orderBy }))
	const from = vi.fn(() => ({ where }))
	selectMock.mockReturnValue({ from })
	return { from, where, orderBy }
}

describe("PricingV2Repository.getBaseFromPolicy", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns base data when a valid policy exists", async () => {
		wireSelectPipeline({ baseAmount: "123.45", baseCurrency: "EUR" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_1",
			date: "2026-08-15",
			occupancyKey: "a2_c1_i0",
		})

		expect(result).toEqual({ baseAmount: 123.45, baseCurrency: "EUR" })
	})

	it("returns null when no policy exists", async () => {
		wireSelectPipeline(null)
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_missing",
			date: "2026-08-15",
			occupancyKey: "a2_c0_i0",
		})

		expect(result).toBeNull()
	})

	it("is deterministic for same input", async () => {
		wireSelectPipeline({ baseAmount: 90, baseCurrency: "USD" })
		const repo = new PricingV2Repository()
		const params = {
			ratePlanId: "rp_det",
			date: "2026-09-01",
			occupancyKey: "a3_c0_i0",
		}

		const first = await repo.getBaseFromPolicy(params)
		const second = await repo.getBaseFromPolicy(params)

		expect(first).toEqual(second)
	})

	it("uses date-range boundaries based on the provided date", async () => {
		wireSelectPipeline({ baseAmount: 100, baseCurrency: "USD" })
		const repo = new PricingV2Repository()

		await repo.getBaseFromPolicy({
			ratePlanId: "rp_dates",
			date: "2026-12-31",
			occupancyKey: "a1_c0_i0",
		})

		expect(lteMock).toHaveBeenCalledTimes(1)
		expect(gteMock).toHaveBeenCalledTimes(1)
		const lteDate = lteMock.mock.calls[0][1] as Date
		const gteDate = gteMock.mock.calls[0][1] as Date
		expect(lteDate.toISOString()).toBe("2026-12-31T00:00:00.000Z")
		expect(gteDate.toISOString()).toBe("2026-12-31T00:00:00.000Z")
	})

	it("accepts occupancyKey without affecting base retrieval contract", async () => {
		wireSelectPipeline({ baseAmount: 77, baseCurrency: "CLP" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_occ",
			date: "2026-05-10",
			occupancyKey: "a4_c2_i1",
		})

		expect(result).toEqual({ baseAmount: 77, baseCurrency: "CLP" })
		expect(andMock).toHaveBeenCalledTimes(1)
		expect(eqMock).toHaveBeenCalledWith("ratePlanId", "rp_occ")
	})
})
