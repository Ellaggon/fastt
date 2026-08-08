import { afterEach, describe, expect, it } from "vitest"
import {
	ENV_ONLY_FEATURE_FLAGS,
	FEATURE_FLAG_DEFAULTS,
	getFeatureFlag,
} from "@/config/featureFlags"
import { resolveTourHoursBeforeDeparture } from "@/lib/tours/tourObservability"

const TOUR_FLAG_NAMES = [
	"TOURS_CHECKOUT_ENABLED",
	"TOURS_REFUND_HOURS_ENABLED",
	"TOURS_CHECKIN_ENABLED",
	"TOURS_PUBLIC_SEARCH_ENABLED",
] as const

const previousEnv = new Map<string, string | undefined>()

function snapshotTourEnv(): void {
	for (const name of TOUR_FLAG_NAMES) {
		previousEnv.set(name, process.env[name])
		delete process.env[name]
	}
}

function restoreTourEnv(): void {
	for (const name of TOUR_FLAG_NAMES) {
		const prev = previousEnv.get(name)
		if (prev === undefined) delete process.env[name]
		else process.env[name] = prev
	}
	previousEnv.clear()
}

afterEach(() => {
	restoreTourEnv()
})

describe("tour rollout feature flags (phase 6)", () => {
	it("defaults tour kill-switches to false (opt-in via env)", () => {
		snapshotTourEnv()
		expect(FEATURE_FLAG_DEFAULTS.TOURS_CHECKOUT_ENABLED).toBe(false)
		expect(FEATURE_FLAG_DEFAULTS.TOURS_REFUND_HOURS_ENABLED).toBe(false)
		expect(FEATURE_FLAG_DEFAULTS.TOURS_CHECKIN_ENABLED).toBe(false)
		expect(FEATURE_FLAG_DEFAULTS.TOURS_PUBLIC_SEARCH_ENABLED).toBe(false)
		for (const name of TOUR_FLAG_NAMES) {
			expect(ENV_ONLY_FEATURE_FLAGS.has(name)).toBe(true)
			expect(getFeatureFlag(name)).toBe(false)
		}
	})

	it("ignores guest header/query overrides when env has the flag off", () => {
		snapshotTourEnv()
		process.env.TOURS_CHECKOUT_ENABLED = "false"
		process.env.TOURS_CHECKIN_ENABLED = "false"

		const guestAttempt = {
			headers: {
				"x-flag-tours-checkout-enabled": "true",
				"x-flag-tours-checkin-enabled": "true",
				"x-flag": "true",
			},
			query: {
				flag: "true",
				TOURS_CHECKOUT_ENABLED: "true",
				tours_checkout_enabled: "true",
				flag_tours_checkout_enabled: "true",
			},
		}

		expect(getFeatureFlag("TOURS_CHECKOUT_ENABLED", guestAttempt)).toBe(false)
		expect(getFeatureFlag("TOURS_CHECKIN_ENABLED", guestAttempt)).toBe(false)
		expect(
			getFeatureFlag("TOURS_CHECKOUT_ENABLED", {
				request: new Request("https://example.test/api/inventory/hold?flag=true", {
					headers: { "x-flag-tours-checkout-enabled": "1" },
				}),
			})
		).toBe(false)
	})

	it("allows env (and context.env) to enable kill-switches", () => {
		snapshotTourEnv()
		expect(
			getFeatureFlag("TOURS_CHECKOUT_ENABLED", {
				env: { TOURS_CHECKOUT_ENABLED: "true" },
				headers: { "x-flag": "false" },
			})
		).toBe(true)
		process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
		expect(getFeatureFlag("TOURS_PUBLIC_SEARCH_ENABLED")).toBe(true)
	})

	it("still allows request overrides for non-env-only search flags", () => {
		expect(
			getFeatureFlag("SEARCH_V2_ENABLED", {
				env: { SEARCH_V2_ENABLED: "false" },
				headers: { "x-flag-search-v2-enabled": "true" },
			})
		).toBe(true)
	})

	it("strips hoursBeforeDeparture when TOURS_REFUND_HOURS_ENABLED is off or stage is off", () => {
		expect(
			resolveTourHoursBeforeDeparture(6, {
				env: { TOURS_REFUND_HOURS_ENABLED: "false", TOURS_ROLLOUT_STAGE: "general" },
			})
		).toBeNull()
		expect(
			resolveTourHoursBeforeDeparture(6, {
				env: { TOURS_REFUND_HOURS_ENABLED: "true", TOURS_ROLLOUT_STAGE: "off" },
			})
		).toBeNull()
		expect(
			resolveTourHoursBeforeDeparture(6, {
				env: { TOURS_REFUND_HOURS_ENABLED: "true", TOURS_ROLLOUT_STAGE: "general" },
			})
		).toBe(6)
	})
})
