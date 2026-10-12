import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	del: vi.fn(),
	aggregate: vi.fn(),
	refresh: vi.fn(),
	select: vi.fn(),
}))
vi.mock("@/lib/cache/persistentCache", () => ({ delByPrefix: mocks.del }))
vi.mock("@/lib/cache/ssrAggregateCache", () => ({ invalidateAggregateCache: mocks.aggregate }))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceByProductId: mocks.refresh,
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()),
	db: { select: mocks.select },
}))
import { invalidateProduct } from "@/lib/cache/invalidation"
beforeEach(() => {
	vi.clearAllMocks()
	mocks.del.mockResolvedValue(undefined)
	mocks.refresh.mockResolvedValue(undefined)
	const query: any = {
		from: () => query,
		innerJoin: () => query,
		leftJoin: () => query,
		where: async () => [{ providerId: "provider" }],
	}
	mocks.select.mockReturnValue(query)
})
it("preserves automatic refresh for existing callers", async () => {
	await invalidateProduct("product")
	await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
	expect(mocks.aggregate).toHaveBeenCalledWith({ productId: "product" })
})
it("invalidates all presentation surfaces while an explicit caller owns refresh", async () => {
	await invalidateProduct("product", { refreshOperationalSurface: false })
	expect(mocks.refresh).not.toHaveBeenCalled()
	expect(mocks.aggregate).toHaveBeenCalledOnce()
	expect(mocks.del).toHaveBeenCalledWith("ws:product:product")
	expect(mocks.del).toHaveBeenCalledWith("ws:search:public")
	expect(mocks.del).toHaveBeenCalledTimes(5)
})
