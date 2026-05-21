import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	requireProvider: vi.fn(),
	loadRatePlansReadModel: vi.fn(),
	buildPricingCalendarSurface: vi.fn(),
	buildInventoryCalendarSurface: vi.fn(),
}))

vi.mock("@/lib/auth/requireProvider", () => ({
	requireProvider: mocks.requireProvider,
}))

vi.mock("@/lib/rates/loadRatePlansReadModel", () => ({
	loadRatePlansReadModel: mocks.loadRatePlansReadModel,
}))

vi.mock("@/lib/rates/calendarSurfaces", () => ({
	buildPricingCalendarSurface: mocks.buildPricingCalendarSurface,
	buildInventoryCalendarSurface: mocks.buildInventoryCalendarSurface,
}))

import { GET } from "@/pages/api/internal/materialization-health"

function freshness(label: string, state: "fresh" | "delayed" | "stale" | "missing") {
	return {
		label,
		state,
		lastMaterializedAt: state === "missing" ? null : "2026-05-21T10:00:00.000Z",
		ageMinutes: state === "missing" ? null : 3,
		coveragePercent: state === "fresh" ? 100 : 80,
		coveredRows: state === "missing" ? 0 : 8,
		expectedRows: 10,
		missingRows: state === "fresh" ? 0 : 2,
		summary: state === "fresh" ? "Actualizado hace 3 min" : "80% materializado",
	}
}

describe("materialization health endpoint", () => {
	it("returns compact health across calendar materializations", async () => {
		mocks.requireProvider.mockResolvedValue({ user: { id: "user_1" }, providerId: "provider_1" })
		mocks.loadRatePlansReadModel.mockResolvedValue([{ ratePlanId: "rp_1" }])
		mocks.buildPricingCalendarSurface.mockResolvedValue({
			month: "2026-05",
			startDate: "2026-05-01",
			endDate: "2026-06-01",
			selectedRatePlan: { ratePlanId: "rp_1" },
			freshness: {
				overall: freshness("Health", "fresh"),
				pricing: freshness("Pricing", "fresh"),
				restrictions: freshness("Restrictions", "fresh"),
				search: freshness("Search", "delayed"),
			},
		})
		mocks.buildInventoryCalendarSurface.mockResolvedValue({
			selectedVariant: { variantId: "var_1" },
			freshness: {
				overall: freshness("Health", "fresh"),
				availability: freshness("Inventory", "fresh"),
				restrictions: freshness("Restrictions", "fresh"),
				search: freshness("Search", "fresh"),
			},
		})

		const response = await GET({
			request: new Request("http://localhost/api/internal/materialization-health"),
			url: new URL("http://localhost/api/internal/materialization-health?month=2026-05"),
		} as never)
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(payload.ok).toBe(true)
		expect(payload.status).toBe("degraded")
		expect(payload.readiness.status).toBe("attention")
		expect(payload.scope).toMatchObject({
			month: "2026-05",
			ratePlanId: "rp_1",
			variantId: "var_1",
		})
		expect(payload.surfaces.pricing.readiness.status).toBe("attention")
		expect(payload.diagnostics.coverage.missingRows).toBe(2)
		expect(payload.diagnostics.warnings[0]).toMatchObject({
			code: "missing_rows",
			label: "Search",
		})
		expect(payload.surfaces.pricing.materializations.search.state).toBe("delayed")
		expect(payload.degraded).toHaveLength(1)
	})
})
