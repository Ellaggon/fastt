import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	requireProvider: vi.fn(),
	loadRatePlans: vi.fn(),
	loadSurface: vi.fn(),
}))

vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider: mocks.requireProvider }))
vi.mock("@/lib/rates/loadRatePlansReadModel", () => ({
	loadProviderRatePlansReadModel: mocks.loadRatePlans,
}))
vi.mock("@/lib/rates/singleCalendarSurface", () => ({
	loadSingleCalendarSurface: mocks.loadSurface,
}))

import { GET } from "@/pages/api/rates/calendar"

const metricNames = [
	"authProvider",
	"ratePlans",
	"pricing",
	"inventory",
	"restrictions",
	"searchFreshness",
	"ical",
	"sidebar",
	"total",
]

describe("calendar API Server-Timing", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.requireProvider.mockResolvedValue({
			providerId: "provider-1",
			user: { id: "user-1" },
		})
		mocks.loadRatePlans.mockResolvedValue([{ ratePlanId: "rate-1", variantId: "variant-1" }])
		mocks.loadSurface.mockImplementation(async ({ timing }) => {
			for (const name of ["pricing", "inventory", "restrictions", "searchFreshness", "ical"]) {
				timing.add(name, 1)
			}
			return { month: "2026-08", days: [] }
		})
	})

	it("returns every calendar segment on a successful surface read", async () => {
		const url = new URL("http://fastt.local/api/rates/calendar?month=2026-08")
		const response = await GET({ request: new Request(url), url } as never)
		const header = response.headers.get("server-timing") ?? ""

		expect(response.status).toBe(200)
		for (const name of metricNames) expect(header).toContain(`${name};dur=`)
		expect(mocks.loadSurface).toHaveBeenCalledWith(
			expect.objectContaining({ providerId: "provider-1", timing: expect.any(Object) })
		)
	})

	it("preserves authentication responses while attaching available timing", async () => {
		mocks.requireProvider.mockRejectedValue(
			new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json", "X-Auth-Reason": "missing-session" },
			})
		)
		const url = new URL("http://fastt.local/api/rates/calendar")
		const response = await GET({ request: new Request(url), url } as never)

		expect(response.status).toBe(401)
		expect(response.headers.get("x-auth-reason")).toBe("missing-session")
		expect(response.headers.get("server-timing")).toContain("authProvider;dur=")
		expect(response.headers.get("server-timing")).toContain("total;dur=")
	})
})
