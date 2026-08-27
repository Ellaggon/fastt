import { describe, expect, it } from "vitest"

import { buildGuestHouseRulesDisplay } from "@/modules/house-rules/presentation/guestHouseRulesDisplay"
import type { GuestStayExpectationsSnapshot } from "@/modules/house-rules/public"

function snapshot(
	rules: GuestStayExpectationsSnapshot["rules"],
	variantId: string | null = null
): GuestStayExpectationsSnapshot {
	return {
		productId: "prod_test",
		variantId,
		source: "house_rule",
		capturedAt: "2026-08-26T12:00:00.000Z",
		version: "house_rule_snapshot:v2:test",
		rules,
	}
}

describe("house-rules/guest display", () => {
	it("returns one effective guest contract and identifies room exceptions", () => {
		const hotel = snapshot([
			{
				id: "hr_smoking",
				type: "Smoking",
				payloadJson: { kind: "Smoking", allowed: false, area: "not_allowed" },
				summary: "No se permite fumar.",
				source: "inherited",
				createdAt: "2026-08-26T12:00:00.000Z",
			},
			{
				id: "hr_quiet",
				type: "QuietHours",
				payloadJson: { kind: "QuietHours", start: "22:00", end: "08:00" },
				summary: "Silencio de 22:00 a 08:00.",
				source: "inherited",
				createdAt: "2026-08-26T12:00:00.000Z",
			},
		])
		const room = snapshot(
			[
				{
					id: "hr_quiet",
					type: "QuietHours",
					payloadJson: { kind: "QuietHours", start: "22:00", end: "08:00" },
					summary: "Silencio de 22:00 a 08:00.",
					source: "inherited",
					createdAt: "2026-08-26T12:00:00.000Z",
				},
				{
					id: "hr_room_smoking",
					type: "Smoking",
					payloadJson: { kind: "Smoking", allowed: true, area: "designated_areas" },
					summary: "Solo se permite fumar en áreas designadas.",
					source: "override",
					createdAt: "2026-08-26T12:01:00.000Z",
				},
			],
			"var_suite"
		)

		const display = buildGuestHouseRulesDisplay({ hotelSnapshot: hotel, roomSnapshot: room })

		expect(display.rules).toHaveLength(2)
		expect(display.overrideTypes).toEqual(new Set(["Smoking"]))
		expect(display.rules.find((rule) => rule.type === "Smoking")?.source).toBe("override")
		expect(display.hasRoomContext).toBe(true)
		expect(display.hasRoomOverrides).toBe(true)
	})
})
