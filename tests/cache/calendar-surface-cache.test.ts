import { afterEach, describe, expect, it, vi } from "vitest"

const { delByPrefix } = vi.hoisted(() => ({
	delByPrefix: vi.fn(async () => undefined),
}))

vi.mock("@/lib/cache/persistentCache", () => ({ delByPrefix }))

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { invalidateCalendarSurface, invalidateProviderIntegrations } from "@/lib/cache/invalidation"

describe("calendar surface server cache", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it("uses the provider, variant, rate plan and month in a short-lived key", () => {
		expect(cacheKeys.calendarSurface("provider-1", "rate-1", "variant-1", "2026-08")).toBe(
			"ws:provider:provider-1:calendar:variant-1:rate-1:2026-08"
		)
		expect(cacheKeys.calendarSurfacePrefix("provider-1")).toBe("ws:provider:provider-1:calendar:")
		expect(cacheTtls.calendarSurface).toBe(15)
	})

	it("invalidates calendar reads after an iCal integration change", async () => {
		await invalidateProviderIntegrations("provider-1", "external_calendar_sync")

		expect(delByPrefix).toHaveBeenCalledWith("ws:provider:provider-1:integrations")
		expect(delByPrefix).toHaveBeenCalledWith("ws:provider:provider-1:calendar:")
	})

	it("supports an explicit calendar-only invalidation for restrictions", async () => {
		await invalidateCalendarSurface("provider-1", "restriction_update")

		expect(delByPrefix).toHaveBeenCalledOnce()
		expect(delByPrefix).toHaveBeenCalledWith("ws:provider:provider-1:calendar:")
	})
})
