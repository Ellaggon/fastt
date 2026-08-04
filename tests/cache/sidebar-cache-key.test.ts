import { describe, expect, it } from "vitest"
import { cacheKeys } from "@/lib/cache/cacheKeys"

describe("provider sidebar cache key", () => {
	it("uses canonical effective mode and role segments", () => {
		expect(cacheKeys.providerSidebar("provider-1", "user-1", false, "admin")).toBe(
			"ws:provider:provider-1:sidebar:user-1:standard:admin"
		)
		expect(cacheKeys.providerSidebar("provider-1", "user-1", true, "admin")).toBe(
			"ws:provider:provider-1:sidebar:user-1:professional:admin"
		)
	})
})
