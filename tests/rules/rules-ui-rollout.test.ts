import { describe, expect, it } from "vitest"

import {
	evaluateRulesUiReadiness,
	resolveRulesUiRollout,
} from "@/lib/feature-flags/rules-ui-rollout"

describe("rules-ui rollout", () => {
	it("supports boolean on/off", () => {
		const on = resolveRulesUiRollout({
			flagValue: "true",
			rolloutId: "session-a",
		})
		const off = resolveRulesUiRollout({
			flagValue: "false",
			rolloutId: "session-a",
		})
		expect(on.enabled).toBe(true)
		expect(on.mode).toBe("on")
		expect(off.enabled).toBe(false)
		expect(off.mode).toBe("off")
	})

	it("supports deterministic percentage rollout", () => {
		const a10 = resolveRulesUiRollout({
			flagValue: "10",
			rolloutId: "session-a",
		})
		const a50 = resolveRulesUiRollout({
			flagValue: "50",
			rolloutId: "session-a",
		})
		const a100 = resolveRulesUiRollout({
			flagValue: "100",
			rolloutId: "session-a",
		})
		const b10 = resolveRulesUiRollout({
			flagValue: "10",
			rolloutId: "session-b",
		})
		const a10Again = resolveRulesUiRollout({
			flagValue: "10",
			rolloutId: "session-a",
		})
		expect(a10.bucket).toBe(a10Again.bucket)
		expect(a50.bucket).toBe(a10.bucket)
		expect(a100.enabled).toBe(true)
		expect(typeof b10.enabled).toBe("boolean")
	})

	it("supports fractional rollout values in 0..1 format", () => {
		const atFivePercent = resolveRulesUiRollout({
			flagValue: "0.05",
			rolloutId: "session-a",
		})
		const atTwentyFivePercent = resolveRulesUiRollout({
			flagValue: "0.25",
			rolloutId: "session-a",
		})
		const atFiftyPercent = resolveRulesUiRollout({
			flagValue: "0.5",
			rolloutId: "session-a",
		})
		const atOne = resolveRulesUiRollout({
			flagValue: "1.0",
			rolloutId: "session-a",
		})
		expect(atFivePercent.mode).toBe("percentage")
		expect(atFivePercent.percentage).toBe(5)
		expect(atTwentyFivePercent.percentage).toBe(25)
		expect(atFiftyPercent.percentage).toBe(50)
		expect(atOne.mode).toBe("on")
		expect(atOne.enabled).toBe(true)
	})

	it("supports percentage suffix values", () => {
		const atFive = resolveRulesUiRollout({
			flagValue: "5%",
			rolloutId: "session-a",
		})
		const atTwentyFive = resolveRulesUiRollout({
			flagValue: "25%",
			rolloutId: "session-a",
		})
		expect(atFive.mode).toBe("percentage")
		expect(atFive.percentage).toBe(5)
		expect(atTwentyFive.percentage).toBe(25)
	})
})

describe("rules-ui fallback readiness", () => {
	it("falls back when rule snapshot is missing", () => {
		const readiness = evaluateRulesUiReadiness({
			hasRuleSnapshot: false,
			hasMapperError: false,
			hasMismatch: false,
		})
		expect(readiness.useRulesUi).toBe(false)
		expect(readiness.fallbackReason).toBe("missing_rule_snapshot")
	})

	it("falls back on mismatch", () => {
		const readiness = evaluateRulesUiReadiness({
			hasRuleSnapshot: true,
			hasMapperError: false,
			hasMismatch: true,
		})
		expect(readiness.useRulesUi).toBe(false)
		expect(readiness.fallbackReason).toBe("mismatch_detected")
	})

	it("falls back on mapper error", () => {
		const readiness = evaluateRulesUiReadiness({
			hasRuleSnapshot: true,
			hasMapperError: true,
			hasMismatch: false,
		})
		expect(readiness.useRulesUi).toBe(false)
		expect(readiness.fallbackReason).toBe("mapper_error")
	})

	it("uses rules UI when all checks pass", () => {
		const readiness = evaluateRulesUiReadiness({
			hasRuleSnapshot: true,
			hasMapperError: false,
			hasMismatch: false,
		})
		expect(readiness.useRulesUi).toBe(true)
		expect(readiness.fallbackReason).toBeNull()
	})
})
