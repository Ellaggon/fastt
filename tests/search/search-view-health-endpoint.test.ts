import { describe, expect, it, vi } from "vitest"

const repositoryMock = vi.hoisted(() => ({
	listSearchViewVariantScope: vi.fn(),
	listSearchViewHealthRows: vi.fn(),
}))

vi.mock("@/container/search-read-model.container", () => ({
	searchReadModelRepository: repositoryMock,
}))

import { GET } from "@/pages/api/internal/observability/search-view-health"
import { SEARCH_VIEW_REASON_CODES } from "@/modules/search/public"

describe("search view health endpoint", () => {
	it("returns deterministic governance payload for fresh view", async () => {
		repositoryMock.listSearchViewVariantScope.mockResolvedValue([
			{ variantId: "var_1", productId: "prod_1", isActive: true },
		])
		repositoryMock.listSearchViewHealthRows.mockResolvedValue([
			{
				variantId: "var_1",
				date: "2026-07-01",
				occupancyKey: "occ_1",
				primaryBlocker: null,
				computedAt: "2026-07-01T10:00:00.000Z",
			},
			{
				variantId: "var_1",
				date: "2026-07-02",
				occupancyKey: "occ_1",
				primaryBlocker: null,
				computedAt: "2026-07-01T10:00:00.000Z",
			},
		])

		const url =
			"http://localhost/api/internal/observability/search-view-health?from=2026-07-01&to=2026-07-03&occupancies=1&now=2026-07-01T10:10:00.000Z"
		const responseA = await GET({ url: new URL(url) } as never)
		const responseB = await GET({ url: new URL(url) } as never)

		expect(responseA.status).toBe(200)
		expect(responseB.status).toBe(200)

		const payloadA = await responseA.json()
		const payloadB = await responseB.json()
		expect(payloadA).toEqual(payloadB)
		expect(payloadA.ok).toBe(true)
		expect(payloadA.health.isFresh).toBe(true)
		expect(payloadA.health.reasonCodes).toEqual([SEARCH_VIEW_REASON_CODES.FRESH_VIEW])
		expect(payloadA.health.coverageRatio).toBe(1)
	})

	it("reports stale + missing coverage when there are no materialized rows", async () => {
		repositoryMock.listSearchViewVariantScope.mockResolvedValue([
			{ variantId: "var_2", productId: "prod_2", isActive: true },
		])
		repositoryMock.listSearchViewHealthRows.mockResolvedValue([])

		const url =
			"http://localhost/api/internal/observability/search-view-health?from=2026-07-01&to=2026-07-04&occupancies=1&now=2026-07-01T10:00:00.000Z"
		const response = await GET({ url: new URL(url) } as never)
		expect(response.status).toBe(200)
		const payload = await response.json()

		expect(payload.health.reasonCodes).toEqual([
			SEARCH_VIEW_REASON_CODES.STALE_VIEW,
			SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE,
		])
		expect(payload.aggregates.gapsDetected).toBe(true)
		expect(payload.aggregates.missingRows).toBe(3)
	})
})
