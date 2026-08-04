import { describe, expect, it, vi } from "vitest"

import { createBoundedClientCache } from "@/lib/rates/calendarSurfaceClientCache"

describe("calendar client surface cache", () => {
	it("keeps recently used surfaces and evicts the oldest entry", () => {
		const cache = createBoundedClientCache<number>(2)
		cache.set("current", 1)
		cache.set("next", 2)

		expect(cache.get("current")).toBe(1)
		cache.set("previous", 3)

		expect(cache.get("next")).toBeNull()
		expect(cache.get("current")).toBe(1)
		expect(cache.get("previous")).toBe(3)
	})

	it("expires entries and supports coordinated invalidation", () => {
		vi.useFakeTimers()
		const cache = createBoundedClientCache<number>(2, 60_000)
		cache.set("current", 1)
		vi.advanceTimersByTime(60_001)
		expect(cache.get("current")).toBeNull()

		cache.set("previous", 2)
		cache.set("next", 3)
		cache.clear()
		expect(cache.get("previous")).toBeNull()
		expect(cache.get("next")).toBeNull()
		vi.useRealTimers()
	})
})
