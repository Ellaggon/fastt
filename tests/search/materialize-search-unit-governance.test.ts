import { beforeEach, describe, expect, it, vi } from "vitest"

const { repoMock } = vi.hoisted(() => ({
	repoMock: {
		resolveProductId: vi.fn(),
		loadMaterializationInputs: vi.fn(),
		resolveSourceVersion: vi.fn(),
		getSearchUnitViewRow: vi.fn(),
		upsertSearchUnitViewRow: vi.fn(),
		resolveDefaultRatePlanIds: vi.fn(),
		resolveGuestRange: vi.fn(),
		purgeStaleSearchUnitRows: vi.fn(),
	},
}))

vi.mock("@/container/search-read-model.container", () => ({
	searchReadModelRepository: repoMock,
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

describe("materialize search unit governance hardening", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		configureSearchUnitMaterializationRepository(repoMock)
		repoMock.resolveProductId.mockResolvedValue("prod-1")
		repoMock.loadMaterializationInputs.mockResolvedValue({
			availabilityRow: { stopSell: false, availableUnits: 2 },
			pricingRow: { finalBasePrice: 120 },
			restrictionRow: { stopSell: false, minStay: 1, cta: false, ctd: false },
		})
		repoMock.resolveSourceVersion.mockResolvedValue("v1")
		repoMock.getSearchUnitViewRow.mockResolvedValue(null)
		repoMock.upsertSearchUnitViewRow.mockResolvedValue(undefined)
		repoMock.resolveDefaultRatePlanIds.mockResolvedValue(["rp-b", "rp-a", "rp-a"])
		repoMock.resolveGuestRange.mockResolvedValue([2, 1, 2])
		repoMock.purgeStaleSearchUnitRows.mockResolvedValue(0)
	})

	it("is idempotent across repeated executions with unchanged sourceVersion", async () => {
		const input = {
			variantId: "var-1",
			ratePlanId: "rp-1",
			date: "2026-10-10",
			totalGuests: 2,
			currency: "USD",
		}

		const first = await materializeSearchUnit(input)
		expect(first.updated).toBe(true)
		expect(repoMock.upsertSearchUnitViewRow).toHaveBeenCalledTimes(1)

		const persisted = repoMock.upsertSearchUnitViewRow.mock.calls[0][0]
		repoMock.getSearchUnitViewRow.mockResolvedValue({
			variantId: persisted.variantId,
			ratePlanId: persisted.ratePlanId,
			date: persisted.date,
			occupancyKey: persisted.occupancyKey,
			totalGuests: persisted.totalGuests,
			hasAvailability: persisted.hasAvailability,
			hasPrice: persisted.hasPrice,
			isSellable: persisted.isSellable,
			isAvailable: persisted.isAvailable,
			availableUnits: persisted.availableUnits,
			stopSell: persisted.stopSell,
			pricePerNight: persisted.pricePerNight,
			currency: persisted.currency,
			primaryBlocker: persisted.primaryBlocker,
			minStay: persisted.minStay,
			cta: persisted.cta,
			ctd: persisted.ctd,
			computedAt: new Date().toISOString(),
			sourceVersion: persisted.sourceVersion,
		})

		const second = await materializeSearchUnit(input)
		expect(second.updated).toBe(false)
		expect(repoMock.upsertSearchUnitViewRow).toHaveBeenCalledTimes(1)
	})

	it("uses canonical gap reason when coverage is missing", async () => {
		repoMock.loadMaterializationInputs.mockResolvedValue({
			availabilityRow: null,
			pricingRow: { finalBasePrice: 120 },
			restrictionRow: { stopSell: false, minStay: 1, cta: false, ctd: false },
		})

		const result = await materializeSearchUnit({
			variantId: "var-gap",
			ratePlanId: "rp-gap",
			date: "2026-10-10",
			totalGuests: 1,
			currency: "USD",
		})

		expect(result.blocker).toBe("MISSING_COVERAGE")
	})

	it("normalizes and deduplicates range materialization deterministically", async () => {
		const result = await materializeSearchUnitRange({
			variantId: "var-r",
			from: "2026-10-01",
			to: "2026-10-03",
			currency: "USD",
		})

		// dates = 2 days, rateplans = 2 unique (rp-a/rp-b), guests = 2 unique (1/2)
		expect(result.rows).toBe(8)
		expect(result.from).toBe("2026-10-01")
		expect(result.to).toBe("2026-10-03")
		expect(repoMock.upsertSearchUnitViewRow).toHaveBeenCalledTimes(8)
	})
})
