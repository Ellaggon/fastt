import { describe, it, expect } from "vitest"

import {
	buildHouseRuleGuestSummary,
	buildGuestStayExpectationsSnapshot,
	createHouseRule,
	deleteHouseRule,
	listHouseRulesByProduct,
} from "@/modules/house-rules/public"
import { upsertGeoPlace, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/house-rules (CAPA 6.5)", () => {
	it("create + listByProduct + delete", async () => {
		const geoPlaceId = `dest_hr_${crypto.randomUUID()}`
		const productId = `prod_hr_${crypto.randomUUID()}`

		await upsertGeoPlace({
			id: geoPlaceId,
			name: "House Rules Destination",
			type: "city",
			country: "CL",
			slug: `hr-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "House Rules Product",
			productType: "Hotel",
			geoPlaceId,
		})

		const r1 = await createHouseRule({
			productId,
			type: "Children",
			payload: { kind: "Children", allowed: true },
		})
		const r2 = await createHouseRule({
			productId,
			type: "Pets",
			payload: { kind: "Pets", allowed: false },
		})
		const r3 = await createHouseRule({
			productId,
			type: "QuietHours",
			payload: { kind: "QuietHours", start: "22:00", end: "08:00" },
		})
		expect(r1.id).toMatch(/.+/)
		expect(r2.id).toMatch(/.+/)
		expect(r3.id).toMatch(/.+/)

		const list1 = await listHouseRulesByProduct(productId)
		expect(list1.length).toBe(3)
		expect(list1.some((r) => r.type === "Children")).toBe(true)
		expect(list1.some((r) => r.type === "Pets")).toBe(true)
		expect(
			list1.some(
				(r) =>
					r.type === "QuietHours" &&
					buildHouseRuleGuestSummary(r.type as any, r.payloadJson) ===
						"Horario de silencio de 22:00 a 08:00."
			)
		).toBe(true)
		const snapshot = await buildGuestStayExpectationsSnapshot(productId, {
			capturedAt: new Date("2026-05-28T10:00:00.000Z"),
		})
		expect(snapshot.source).toBe("house_rule")
		expect(snapshot.variantId).toBeNull()
		expect(snapshot.version).toMatch(/^house_rule_snapshot:v2:/)
		expect(snapshot.rules.map((rule) => rule.summary)).toContain(
			"Horario de silencio de 22:00 a 08:00."
		)
		expect(snapshot.rules.every((rule) => rule.source === "inherited")).toBe(true)

		await deleteHouseRule(r1.id)
		const list2 = await listHouseRulesByProduct(productId)
		expect(list2.length).toBe(2)
		expect(list2.some((r) => r.type === "Pets")).toBe(true)
	})
})
