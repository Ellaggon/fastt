import { describe, expect, it } from "vitest"
import { providerCalendarDate } from "@/lib/rates/providerCalendarDate"

describe("provider calendar day", () => {
	it.each([
		["America/La_Paz", "2026-10-01T01:00:00Z", "2026-09-30"],
		["Pacific/Auckland", "2026-09-30T20:00:00Z", "2026-10-01"],
		["America/Santiago", "2026-09-06T03:59:59Z", "2026-09-05"],
		["America/Santiago", "2026-09-06T04:00:00Z", "2026-09-06"],
		["UTC", "2026-10-01T00:00:00Z", "2026-10-01"],
		[null, "2026-10-01T00:00:00Z", "2026-10-01"],
	])("uses %s at %s", (zone, instant, expected) => {
		expect(providerCalendarDate(zone, new Date(instant))).toBe(expected)
	})
})
