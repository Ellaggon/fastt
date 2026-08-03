import { beforeEach, describe, expect, it, vi } from "vitest"

const { requireProvider, buildSurface, loadHistory } = vi.hoisted(() => ({
	requireProvider: vi.fn(),
	buildSurface: vi.fn(),
	loadHistory: vi.fn(),
}))

vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider }))
vi.mock("@/lib/rates/providerRatePlansSurface", () => ({
	buildProviderRatePlansSurface: buildSurface,
}))
vi.mock("@/lib/audit/contextualHistory", () => ({
	formatHistoryDate: () => "2 ago 2026, 10:00",
	loadRatesContextualHistory: loadHistory,
}))
vi.mock("@/modules/policies/public", () => ({
	resolvePolicyDateRange: () => ({ checkIn: "2026-08-02", checkOut: "2026-09-01" }),
}))

import { GET } from "@/pages/api/rates/plans/history"

describe("rate plan history endpoint", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		requireProvider.mockResolvedValue({ providerId: "provider-1", user: { id: "user-1" } })
		buildSurface.mockResolvedValue({ ratePlans: [{ ratePlanId: "rate-1" }] })
		loadHistory.mockResolvedValue([
			{
				id: "rate_plan:rate-1",
				title: "Tarifa creada",
				description: "Tarifa disponible.",
				createdAt: "2026-08-02T10:00:00.000Z",
			},
		])
	})

	it("authenticates and returns deferred history from the shared surface", async () => {
		const request = new Request("http://localhost/api/rates/plans/history")
		const response = await GET({ request, url: new URL(request.url) } as never)
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(response.headers.get("cache-control")).toBe("no-store")
		expect(buildSurface).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "provider-1",
				checkIn: "2026-08-02",
				checkOut: "2026-09-01",
				timing: expect.any(Object),
			})
		)
		expect(loadHistory).toHaveBeenCalledWith(
			expect.objectContaining({ providerId: "provider-1", limit: 8 })
		)
		expect(payload.history[0]).toEqual(
			expect.objectContaining({ title: "Tarifa creada", createdAtLabel: "2 ago 2026, 10:00" })
		)
		expect(response.headers.get("server-timing")).toContain("authProvider;dur=")
		expect(response.headers.get("server-timing")).toContain("history;dur=")
		expect(response.headers.get("server-timing")).toContain("total;dur=")
	})

	it("rejects unauthenticated requests before loading operational data", async () => {
		requireProvider.mockRejectedValue(new Response(null, { status: 401 }))
		const request = new Request("http://localhost/api/rates/plans/history")
		const response = await GET({ request, url: new URL(request.url) } as never)

		expect(response.status).toBe(401)
		expect(buildSurface).not.toHaveBeenCalled()
	})
})
