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
			source: "house_rule",
			capturedAt: "2026-05-28T10:00:00.000Z",
		})
		expect(snapshot.version).toMatch(/^house_rule_snapshot:v1:/)
		expect(snapshot.rules).toHaveLength(1)
		expect(snapshot.rules[0]).toMatchObject({
			id: "rule_quiet",
			type: "QuietHours",
			source: "house_rule",
			summary: "Horario de silencio de 22:00 a 08:00.",
		})
	})
})
