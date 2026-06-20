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
			"No se permiten mascotas. Service animals remain allowed where required."
		)
	})

	it("validates quiet hours as a typed time window", () => {
		const payload = normalizeHouseRulePayload("QuietHours", {
			start: "22:00",
			end: "08:00",
		})

		expect(() => validateHouseRulePayload("QuietHours", payload)).not.toThrow()
		expect(buildHouseRuleGuestSummary("QuietHours", payload)).toBe(
			"Horario de silencio de 22:00 a 08:00."
		)
	})

	it("rejects ambiguous typed permission rules", () => {
		const payload = normalizeHouseRulePayload("Smoking", { note: "Balcony guidance applies." })

		expect(() => validateHouseRulePayload("Smoking", payload)).toThrow(
			"validation_error:allowed_required"
		)
	})

	it("models hotel arrival as a contractual local-time window", () => {
		const payload = normalizeHouseRulePayload("CheckIn", {
			method: "front_desk",
			checkInFrom: "15:00",
			checkInUntil: "22:00",
		})

		expect(() => validateHouseRulePayload("CheckIn", payload)).not.toThrow()
		expect(buildHouseRuleGuestSummary("CheckIn", payload)).toContain("Llegada de 15:00 a 22:00.")
	})

	it("rejects check-in configuration without a complete time window", () => {
		const payload = normalizeHouseRulePayload("CheckIn", { method: "front_desk" })
		expect(() => validateHouseRulePayload("CheckIn", payload)).toThrow(
			"validation_error:checkin_details_required"
		)
	})
})
