import { describe, expect, it } from "vitest"

import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/domain/guestStayExpectationsSnapshot"

describe("guest stay expectations snapshot", () => {
	it("builds an informative payload-only snapshot for guest-facing house rules", () => {
		const snapshot = buildGuestStayExpectationsSnapshot({
			productId: "product_1",
			capturedAt: new Date("2026-05-28T10:00:00.000Z"),
			rules: [
				{
					id: "rule_quiet",
					type: "QuietHours",
					payloadJson: { kind: "QuietHours", start: "22:00", end: "08:00" },
					createdAt: "2026-05-20T10:00:00.000Z",
				},
				{
					id: "rule_empty",
					type: "Other",
					payloadJson: { kind: "Other" },
					createdAt: "2026-05-21T10:00:00.000Z",
				},
			],
		})

		expect(snapshot).toMatchObject({
			productId: "product_1",
			variantId: null,
			source: "house_rule",
			capturedAt: "2026-05-28T10:00:00.000Z",
		})
		expect(snapshot.version).toMatch(/^house_rule_snapshot:v2:/)
		expect(snapshot.rules).toHaveLength(1)
		expect(snapshot.rules[0]).toMatchObject({
			id: "rule_quiet",
			type: "QuietHours",
			source: "inherited",
			summary: "Horario de silencio de 22:00 a 08:00.",
		})
	})

	it("marks a variant rule as override in the guest snapshot", () => {
		const snapshot = buildGuestStayExpectationsSnapshot({
			productId: "product_1",
			variantId: "room_1",
			capturedAt: new Date("2026-05-28T10:00:00.000Z"),
			rules: [
				{
					id: "rule_hotel",
					type: "Smoking",
					source: "inherited",
					payloadJson: { kind: "Smoking", allowed: false, area: "not_allowed" },
					createdAt: "2026-05-20T10:00:00.000Z",
				},
				{
					id: "rule_room",
					type: "Smoking",
					source: "override",
					payloadJson: { kind: "Smoking", allowed: true, area: "rooms" },
					createdAt: "2026-05-21T10:00:00.000Z",
				},
			],
		})

		expect(snapshot.variantId).toBe("room_1")
		expect(snapshot.rules.map((rule) => rule.source)).toEqual(["inherited", "override"])
	})
})
