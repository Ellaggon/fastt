import { describe, expect, it } from "vitest"

import {
	buildHouseRuleGuestSummary,
	normalizeHouseRulePayload,
	validateHouseRulePayload,
} from "@/modules/house-rules/domain/houseRule"

describe("house rule structured payloads", () => {
	it("renders pet permissions as guest-facing expectations", () => {
		const payload = normalizeHouseRulePayload("Pets", {
			allowed: false,
			feeNote: "Service animals remain allowed where required.",
		})

		expect(buildHouseRuleGuestSummary("Pets", payload)).toBe(
			"Pets are not allowed. Service animals remain allowed where required."
		)
	})

	it("validates quiet hours as a typed time window", () => {
		const payload = normalizeHouseRulePayload("QuietHours", {
			start: "22:00",
			end: "08:00",
		})

		expect(() => validateHouseRulePayload("QuietHours", payload)).not.toThrow()
		expect(buildHouseRuleGuestSummary("QuietHours", payload)).toBe(
			"Quiet hours are from 22:00 to 08:00."
		)
	})

	it("rejects ambiguous typed permission rules", () => {
		const payload = normalizeHouseRulePayload("Smoking", { note: "Balcony guidance applies." })

		expect(() => validateHouseRulePayload("Smoking", payload)).toThrow(
			"validation_error:allowed_required"
		)
	})
})
