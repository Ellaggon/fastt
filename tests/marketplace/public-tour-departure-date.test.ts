import { describe, expect, it } from "vitest"

import { resolveDestinationTourDepartureDate } from "@/lib/marketplace/publicTourDepartureDate"

describe("destination tour departure date", () => {
	it("defaults to today when a destination landing has no date", () => {
		expect(resolveDestinationTourDepartureDate(new URLSearchParams(), "2026-09-24")).toBe(
			"2026-09-24"
		)
	})

	it("keeps an explicit departure date", () => {
		expect(
			resolveDestinationTourDepartureDate(
				new URLSearchParams("startDate=2026-10-02"),
				"2026-09-24"
			)
		).toBe("2026-10-02")
	})

	it("does not put today back after the traveler clears the date", () => {
		expect(
			resolveDestinationTourDepartureDate(new URLSearchParams("startDate="), "2026-09-24")
		).toBe("")
		expect(
			resolveDestinationTourDepartureDate(new URLSearchParams("checkin="), "2026-09-24")
		).toBe("")
	})
})
