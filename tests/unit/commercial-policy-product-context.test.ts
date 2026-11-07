import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
	const rows = vi.fn()
	const chain: Record<string, any> = {}
	for (const name of ["from", "leftJoin", "where", "limit"]) chain[name] = vi.fn(() => chain)
	chain.then = (resolve: any, reject: any) => rows().then(resolve, reject)
	return { rows, chain, select: vi.fn(() => chain), holder: vi.fn() }
})
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<typeof import("@/shared/infrastructure/db/compat")>()),
	db: { select: mocks.select },
}))
vi.mock("@/lib/provider-holder-profile", () => ({ readProviderHolderProfile: mocks.holder }))

import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"

beforeEach(() => {
	vi.clearAllMocks()
	mocks.holder.mockResolvedValue(null)
})

describe("commercial policy product and format lookup", () => {
	it("blocks a missing owned product without reading provider evidence", async () => {
		mocks.rows.mockResolvedValue([])
		const result = await resolveProductCommercialDiagnosis({
			providerId: "provider",
			productId: "tour",
		})
		expect(result.vertical).toBeNull()
		expect(mocks.holder).not.toHaveBeenCalled()
		expect(mocks.select).toHaveBeenCalledTimes(1)
	})

	it.each([
		{ tourProductId: null, experienceFormat: null, formatContractVersion: null },
		{ tourProductId: "tour", experienceFormat: null, formatContractVersion: 1 },
	])("keeps missing modern tour format blocked", async (format) => {
		mocks.rows.mockResolvedValue([{ productType: "tour", ...format }])
		const result = await resolveProductCommercialDiagnosis({
			providerId: "provider",
			productId: "tour",
		})
		expect(result.diagnosis.blockers[0]?.id).toBe("experience_format_missing")
		expect(mocks.holder).not.toHaveBeenCalled()
		expect(mocks.select).toHaveBeenCalledTimes(1)
	})

	it.each([
		{ experienceFormat: "guided_tour", formatContractVersion: 1 },
		{ experienceFormat: null, formatContractVersion: 0 },
	])("preserves accepted modern and legacy formats with one joined read", async (format) => {
		mocks.rows.mockResolvedValue([{ productType: "tour", tourProductId: "tour", ...format }])
		const result = await resolveProductCommercialDiagnosis({
			providerId: "provider",
			productId: "tour",
		})
		expect(result.diagnosis.blockers[0]?.id).toBe("holder_declaration_missing")
		expect(mocks.holder).toHaveBeenCalledTimes(1)
		expect(mocks.select).toHaveBeenCalledTimes(1)
			expect(mocks.chain.leftJoin).toHaveBeenCalledTimes(3)
	})

	it("does not treat a database failure as permission to publish", async () => {
		mocks.rows.mockRejectedValue(new Error("offline"))
		await expect(
			resolveProductCommercialDiagnosis({ providerId: "provider", productId: "tour" })
		).rejects.toThrow("offline")
	})
})
