import { beforeEach, describe, expect, it, vi } from "vitest"

const { selectMock, allMock, andMock, orMock, eqMock, lteMock, descMock, isNullMock, sqlMock } =
	vi.hoisted(() => ({
		selectMock: vi.fn(),
		allMock: vi.fn(),
		andMock: vi.fn((...args: any[]) => ({ and: args })),
		orMock: vi.fn((...args: any[]) => ({ or: args })),
		eqMock: vi.fn((...args: any[]) => ({ eq: args })),
		lteMock: vi.fn((...args: any[]) => ({ lte: args })),
		descMock: vi.fn((...args: any[]) => ({ desc: args })),
		isNullMock: vi.fn((...args: any[]) => ({ isNull: args })),
		sqlMock: vi.fn((parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values })),
	}))

vi.mock("astro:db", () => ({
	db: {
		select: selectMock,
	},
	and: andMock,
	or: orMock,
	eq: eqMock,
	lte: lteMock,
	lt: vi.fn(),
	desc: descMock,
	isNull: isNullMock,
	sql: sqlMock,
	RatePlanOccupancyPolicy: {
		id: "id",
		ratePlanId: "ratePlanId",
		effectiveFrom: "effectiveFrom",
		effectiveTo: "effectiveTo",
		baseAmount: "baseAmount",
		currency: "currency",
		baseAdults: "baseAdults",
		baseChildren: "baseChildren",
		extraAdultMode: "extraAdultMode",
		extraAdultValue: "extraAdultValue",
		childMode: "childMode",
		childValue: "childValue",
	},
	EffectivePricingV2: {
		id: "id",
		variantId: "variantId",
		ratePlanId: "ratePlanId",
		date: "date",
		occupancyKey: "occupancyKey",
		baseComponent: "baseComponent",
		currency: "currency",
		computedAt: "computedAt",
	},
}))

import { PricingV2Repository } from "@/modules/pricing/infrastructure/repositories/PricingV2Repository"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

function wireSelectPipeline(result: any) {
	allMock.mockResolvedValue(result == null ? [] : [result])
	const get = vi.fn(async () => null)
	const limit = vi.fn(() => ({ all: allMock, get }))
	const orderBy = vi.fn(() => ({ limit }))
	const where = vi.fn(() => ({ orderBy }))
	const from = vi.fn(() => ({ where }))
	selectMock.mockReturnValue({ from })
	return { from, where, orderBy, limit }
}

function wireSelectPipelineMany(results: any[]) {
	allMock.mockResolvedValue(results)
	const get = vi.fn(async () => null)
	const limit = vi.fn(() => ({ all: allMock, get }))
	const orderBy = vi.fn(() => ({ limit }))
	const where = vi.fn(() => ({ orderBy }))
	const from = vi.fn(() => ({ where }))
	selectMock.mockReturnValue({ from })
	return { from, where, orderBy, limit }
}

function wirePolicyMissThenEffectiveFallback(result: any) {
	const policyAll = vi.fn(async () => [])
	const policyLimit = vi.fn(() => ({ all: policyAll }))
	const policyOrderBy = vi.fn(() => ({ limit: policyLimit }))
	const policyWhere = vi.fn(() => ({ orderBy: policyOrderBy }))
	const policyFrom = vi.fn(() => ({ where: policyWhere }))
	const effectiveGet = vi.fn(async () => result)
	const effectiveLimit = vi.fn(() => ({ get: effectiveGet }))
	const effectiveOrderBy = vi.fn(() => ({ limit: effectiveLimit }))
	const effectiveWhere = vi.fn(() => ({ orderBy: effectiveOrderBy }))
	const effectiveFrom = vi.fn(() => ({ where: effectiveWhere }))
	selectMock.mockReturnValueOnce({ from: policyFrom }).mockReturnValueOnce({ from: effectiveFrom })
	return { policyAll, effectiveGet }
}

describe("PricingV2Repository.getBaseFromPolicy", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns base data when a valid policy exists", async () => {
		wireSelectPipeline({ baseAmount: "123.45", currency: "EUR" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_1",
			date: "2026-08-15",
			occupancyKey: buildOccupancyKey({ adults: 2, children: 1, infants: 0 }),
		})

		expect(result).toEqual({ baseAmount: 123.45, currency: "EUR" })
	})

	it("returns null when no policy exists", async () => {
		wireSelectPipeline(null)
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_missing",
			date: "2026-08-15",
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
		})

		expect(result).toBeNull()
	})

	it("falls back to existing effective pricing base when a policy has not been bootstrapped yet", async () => {
		wirePolicyMissThenEffectiveFallback({ baseAmount: 14.52, currency: "USD" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_effective_only",
			date: "2026-05-20",
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
		})

		expect(result).toEqual({ baseAmount: 14.52, currency: "USD" })
		expect(eqMock).toHaveBeenCalledWith("occupancyKey", "a2_c0_i0")
	})

	it("is deterministic for same input", async () => {
		wireSelectPipeline({ baseAmount: 90, currency: "USD" })
		const repo = new PricingV2Repository()
		const params = {
			ratePlanId: "rp_det",
			date: "2026-09-01",
			occupancyKey: buildOccupancyKey({ adults: 3, children: 0, infants: 0 }),
		}

		const first = await repo.getBaseFromPolicy(params)
		const second = await repo.getBaseFromPolicy(params)

		expect(first).toEqual(second)
	})

	it("uses date-range boundaries based on the provided date", async () => {
		wireSelectPipeline({ id: "p1", baseAmount: 100, currency: "USD" })
		const repo = new PricingV2Repository()

		await repo.getBaseFromPolicy({
			ratePlanId: "rp_dates",
			date: "2026-12-31",
			occupancyKey: buildOccupancyKey({ adults: 1, children: 0, infants: 0 }),
		})

		expect(lteMock).toHaveBeenCalledTimes(1)
		const lteDate = lteMock.mock.calls[0][1] as Date
		expect(lteDate.toISOString()).toBe("2026-12-31T00:00:00.000Z")
		expect(orMock).toHaveBeenCalledTimes(1)
		expect(isNullMock).toHaveBeenCalledTimes(1)
		expect(descMock).toHaveBeenCalled()
	})

	it("accepts occupancyKey without affecting base retrieval contract", async () => {
		wireSelectPipeline({ baseAmount: 77, currency: "CLP" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_occ",
			date: "2026-05-10",
			occupancyKey: buildOccupancyKey({ adults: 4, children: 2, infants: 1 }),
		})

		expect(result).toEqual({ baseAmount: 77, currency: "CLP" })
		expect(andMock).toHaveBeenCalledTimes(1)
		expect(eqMock).toHaveBeenCalledWith("ratePlanId", "rp_occ")
	})

	it("resolves overlap deterministically by latest effectiveFrom", async () => {
		wireSelectPipelineMany([
			{ id: "newer", baseAmount: 130, currency: "USD" },
			{ id: "older", baseAmount: 90, currency: "USD" },
		])
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_overlap",
			date: "2026-05-10",
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
		})

		expect(result).toEqual({ baseAmount: 130, currency: "USD" })
	})

	it("supports open-ended policies (effectiveTo null)", async () => {
		wireSelectPipeline({ id: "open", baseAmount: 88, currency: "USD" })
		const repo = new PricingV2Repository()

		const result = await repo.getBaseFromPolicy({
			ratePlanId: "rp_open",
			date: "2026-05-10",
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
		})

		expect(result).toEqual({ baseAmount: 88, currency: "USD" })
		expect(isNullMock).toHaveBeenCalledWith("effectiveTo")
	})
})
