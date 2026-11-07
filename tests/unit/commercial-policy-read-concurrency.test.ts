import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rows: vi.fn(), historical: vi.fn(), ancestors: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<typeof import("@/shared/infrastructure/db/compat")>()),
	db: {
		select: () => ({ from: () => ({ innerJoin: () => ({ where: () => mocks.rows() }) }) }),
	},
}))
vi.mock("@/lib/tours/operating-geography", () => ({
	readHistoricalTerritoryMap: mocks.historical,
	readTerritoryAncestors: mocks.ancestors,
}))

import { diagnoseCommercialPolicy } from "@/lib/commercial-policy/read"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyContext,
} from "@/lib/commercial-policy/evaluate"

const context: CommercialPolicyContext = {
	holderType: "persona_natural",
	holderCountry: "BO",
	taxCountry: "BO",
	payoutCountry: "BO",
	productCountry: "BO",
	vertical: "tour",
	collectionModel: "property_collect",
}
const now = new Date("2026-11-06T12:00:00Z")

beforeEach(() => {
	vi.clearAllMocks()
	mocks.rows.mockResolvedValue([])
	mocks.historical.mockResolvedValue({})
	mocks.ancestors.mockResolvedValue({})
})

it("loads territory metadata while policy versions are pending without changing the decision", async () => {
	let release!: (rows: unknown[]) => void
	mocks.rows.mockReturnValueOnce(
		new Promise((resolve) => {
			release = resolve
		})
	)
	let completed = false
	const pending = diagnoseCommercialPolicy({ context, now }).then((result) => {
		completed = true
		return result
	})
	try {
		await vi.waitFor(() => {
			expect(mocks.historical).toHaveBeenCalledTimes(1)
			expect(mocks.ancestors).toHaveBeenCalledTimes(1)
		})
		expect(completed).toBe(false)
	} finally {
		release([])
	}
	expect(await pending).toEqual(
		evaluateCommercialPolicy({ context: { ...context, territoryAncestors: {} }, versions: [], now })
	)
})

it("propagates territory read failure rather than granting incomplete coverage", async () => {
	mocks.ancestors.mockRejectedValue(new Error("territory unavailable"))
	await expect(diagnoseCommercialPolicy({ context, now })).rejects.toThrow("territory unavailable")
})
