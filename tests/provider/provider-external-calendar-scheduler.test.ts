import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	externalCalendarRetryMinutes,
	verifyCronAuthorization,
} from "@/lib/provider-external-calendar-scheduler"

describe("provider external calendar scheduler", () => {
	it("fails closed when CRON_SECRET is absent or too short", () => {
		expect(verifyCronAuthorization(null, undefined)).toBe("misconfigured")
		expect(verifyCronAuthorization("Bearer short", "short")).toBe("misconfigured")
	})

	it("accepts only the exact Vercel Bearer secret", () => {
		const secret = "calendar-cron-secret-123"
		expect(verifyCronAuthorization(`Bearer ${secret}`, secret)).toBe("authorized")
		expect(verifyCronAuthorization(`Bearer ${secret}-wrong`, secret)).toBe("unauthorized")
		expect(verifyCronAuthorization(null, secret)).toBe("unauthorized")
	})

	it("backs off failed feeds without exceeding six hours or their normal cadence", () => {
		expect(externalCalendarRetryMinutes(0, 1440)).toBe(15)
		expect(externalCalendarRetryMinutes(3, 1440)).toBe(120)
		expect(externalCalendarRetryMinutes(10, 1440)).toBe(360)
		expect(externalCalendarRetryMinutes(10, 60)).toBe(60)
	})

	it("registers one production-safe daily Vercel cron", () => {
		const config = JSON.parse(readFileSync("vercel.json", "utf8"))
		expect(config.crons).toContainEqual({
			path: "/api/cron/external-calendars",
			schedule: "17 3 * * *",
		})
	})
})
