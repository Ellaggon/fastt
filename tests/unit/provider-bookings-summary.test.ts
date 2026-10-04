import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	user: vi.fn(),
	provider: vi.fn(),
	keys: [] as string[],
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: mocks.user }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({ getProviderIdFromRequest: mocks.provider }))
vi.mock("@/lib/cache/readThrough", () => ({
	readThrough: async (key: string, _ttl: number, read: () => Promise<unknown>) => {
		mocks.keys.push(key)
		return read()
	},
}))
vi.mock("@/modules/booking/public", () => ({
	bookingOperationsQueryRepository: { listByProvider: mocks.list },
}))
import { GET } from "@/pages/api/internal/provider-bookings-summary"
const get = (query: string) => {
	const url = new URL(`https://fastt.test/api/internal/provider-bookings-summary?${query}`)
	return GET({ request: new Request(url), url } as never)
}
beforeEach(() => {
	vi.clearAllMocks()
	mocks.keys = []
	mocks.user.mockResolvedValue({ email: "operator@example.test" })
	mocks.provider.mockResolvedValue("provider-1")
	mocks.list.mockResolvedValue({
		items: [{ bookingId: "booking-1", vertical: "tour" }],
		summary: { total: 103 },
		pagination: { total: 103, returned: 1, hasMore: true },
	})
})
describe("scoped booking summary HTTP contract", () => {
	it("passes the complete query to persistence and retains its scoped totals", async () => {
		const response = await get(
			"scope=tour&departureDate=2026-10-04&productId=tour-1&variantId=option-1&offset=100&limit=100&status=confirmed"
		)
		expect(response.status).toBe(200)
		expect(mocks.list).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "provider-1",
				vertical: "tour",
				departureDate: "2026-10-04",
				productId: "tour-1",
				variantId: "option-1",
				offset: 100,
				limit: 100,
				status: "confirmed",
			})
		)
		expect((await response.json()).pagination.total).toBe(103)
	})
	it("separates cache entries for date, option and page", async () => {
		await get("scope=tour&departureDate=2026-10-04&variantId=A")
		await get("scope=tour&departureDate=2026-10-05&variantId=A")
		await get("scope=tour&departureDate=2026-10-04&variantId=B")
		await get("scope=tour&departureDate=2026-10-04&variantId=A&offset=100")
		expect(new Set(mocks.keys).size).toBe(4)
	})
	it.each(["departureDate=2026-02-30", "offset=-1", "offset=Infinity", "scope=unknown"])(
		"rejects %s without reading bookings",
		async (query) => {
			expect((await get(query)).status).toBe(400)
			expect(mocks.list).not.toHaveBeenCalled()
		}
	)
	it("requires authentication", async () => {
		mocks.user.mockResolvedValue(null)
		expect((await get("scope=tour")).status).toBe(401)
		expect(mocks.list).not.toHaveBeenCalled()
	})
})
