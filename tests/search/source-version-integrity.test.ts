import { beforeEach, describe, expect, it, vi } from "vitest"

const { repoMock } = vi.hoisted(() => ({
	repoMock: {
		resolveProductId: vi.fn(),
		loadMaterializationInputs: vi.fn(),
		resolveSourceVersion: vi.fn(),
		getSearchUnitViewRow: vi.fn(),
		upsertSearchUnitViewRow: vi.fn(),
		resolveDefaultRatePlanIds: vi.fn(),
		resolveOccupancyCombinations: vi.fn(),
		purgeStaleSearchUnitRows: vi.fn(),
	},
}))

vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: vi.fn(() => false),
}))

vi.mock("@/modules/policies/public", () => ({
	resolveEffectivePolicies: vi.fn(),
	normalizePolicyResolutionResult: vi.fn(),
}))

import {
	configureSearchUnitMaterializationRepository,
	materializeSearchUnit,
	materializeSearchUnitRange,
} from "@/modules/search/application/use-cases/materialize-search-unit"

describe("sourceVersion integrity (occupancy-aware)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		configureSearchUnitMaterializationRepository(repoMock as any)
		repoMock.resolveProductId.mockResolvedValue("prod-1")
		repoMock.loadMaterializationInputs.mockResolvedValue({
			availabilityRow: { stopSell: false, availableUnits: 2 },
			pricingRow: { finalBasePrice: 120 },
			restrictionRow: { stopSell: false, minStay: 1, cta: false, ctd: false },
		})
		repoMock.getSearchUnitViewRow.mockResolvedValue(null)
		repoMock.upsertSearchUnitViewRow.mockResolvedValue(undefined)
		repoMock.resolveDefaultRatePlanIds.mockResolvedValue(["rp-1"])
		repoMock.resolveOccupancyCombinations.mockResolvedValue([
			{ adults: 2, children: 0, infants: 0 },
			{ adults: 1, children: 1, infants: 0 },
		])
		repoMock.purgeStaleSearchUnitRows.mockResolvedValue(0)
		repoMock.resolveSourceVersion.mockImplementation(
			async (params: any) =>
				`sv:${params.variantId}:${params.ratePlanId}:${params.date}:${params.occupancyKey}`
		)
	})

	it("produces different sourceVersion for different occupancy on same day", async () => {
		await materializeSearchUnit({
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-11-20",
			occupancy: { adults: 2, children: 0, infants: 0 },
			currency: "USD",
		})
		await materializeSearchUnit({
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-11-20",
			occupancy: { adults: 1, children: 1, infants: 0 },
			currency: "USD",
		})

		const first = repoMock.upsertSearchUnitViewRow.mock.calls[0][0]
		const second = repoMock.upsertSearchUnitViewRow.mock.calls[1][0]
		expect(first.sourceVersion).not.toBe(second.sourceVersion)
	})

	it("is idempotent for same occupancy inputs", async () => {
		await materializeSearchUnit({
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-11-20",
			occupancy: { adults: 2, children: 0, infants: 0 },
			currency: "USD",
		})
		await materializeSearchUnit({
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-11-20",
			occupancy: { adults: 2, children: 0, infants: 0 },
			currency: "USD",
		})

		const firstResolveArg = repoMock.resolveSourceVersion.mock.calls[0][0]
		const secondResolveArg = repoMock.resolveSourceVersion.mock.calls[1][0]
		expect(firstResolveArg).toEqual(secondResolveArg)
	})

	it("passes occupancyKey into sourceVersion resolver", async () => {
		await materializeSearchUnit({
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-11-20",
			occupancy: { adults: 1, children: 1, infants: 0 },
			currency: "USD",
		})

		expect(repoMock.resolveSourceVersion).toHaveBeenCalledWith(
			expect.objectContaining({
				variantId: "var-1",
				ratePlanId: "rp-1",
				date: "2026-11-20",
				occupancyKey: "a1_c1_i0",
			})
		)
	})

	it("range materialization does not collide rows for multiple occupancy keys on same date", async () => {
		await materializeSearchUnitRange({
			variantId: "var-1",
			ratePlanId: "rp-1",
			from: "2026-11-20",
			to: "2026-11-21",
			currency: "USD",
		})

		const rows = repoMock.upsertSearchUnitViewRow.mock.calls.map((call: any[]) => call[0])
		const ids = new Set(rows.map((row: any) => row.id))
		const occupancyKeys = new Set(rows.map((row: any) => row.occupancyKey))
		expect(rows.length).toBe(2)
		expect(ids.size).toBe(2)
		expect(occupancyKeys).toEqual(new Set(["a2_c0_i0", "a1_c1_i0"]))
	})
})
