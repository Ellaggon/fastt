import { describe, expect, it } from "vitest"

import { resolveEffectiveHouseRules } from "@/modules/house-rules/domain/effectiveHouseRules"
import {
	isVariantOverrideHouseRuleType,
	type HouseRule,
} from "@/modules/house-rules/domain/houseRule"

function rule(partial: Partial<HouseRule> & Pick<HouseRule, "id" | "type" | "scope">): HouseRule {
	return {
		productId: "hotel-1",
		scopeId: partial.scope === "variant" ? "room-1" : null,
		payloadJson: { kind: partial.type },
		createdAt: "2026-08-01T00:00:00.000Z",
		...partial,
	}
}

describe("house-rules effective resolution", () => {
	it("uses the hotel default when the room has no override", () => {
		const effective = resolveEffectiveHouseRules({
			productRules: [
				rule({
					id: "hotel-smoking",
					scope: "product",
					type: "Smoking",
					payloadJson: { kind: "Smoking", allowed: false, area: "not_allowed" },
				}),
			],
			variantRules: [],
		})

		expect(effective).toHaveLength(1)
		expect(effective[0]).toMatchObject({
			id: "hotel-smoking",
			source: "inherited",
			payloadJson: expect.objectContaining({ allowed: false }),
		})
	})

	it("lets a room override replace the hotel default of the same type", () => {
		const effective = resolveEffectiveHouseRules({
			productRules: [
				rule({
					id: "hotel-smoking",
					scope: "product",
					type: "Smoking",
					payloadJson: { kind: "Smoking", allowed: false, area: "not_allowed" },
				}),
				rule({
					id: "hotel-quiet",
					scope: "product",
					type: "QuietHours",
					payloadJson: { kind: "QuietHours", start: "22:00", end: "08:00" },
				}),
			],
			variantRules: [
				rule({
					id: "room-smoking",
					scope: "variant",
					scopeId: "room-1",
					type: "Smoking",
					payloadJson: { kind: "Smoking", allowed: true, area: "rooms" },
				}),
			],
		})

		expect(effective.map((item) => `${item.type}:${item.source}`).sort()).toEqual([
			"QuietHours:inherited",
			"Smoking:override",
		])
		expect(effective.find((item) => item.type === "Smoking")?.id).toBe("room-smoking")
	})

	it("does not treat quiet hours as a room override type", () => {
		expect(isVariantOverrideHouseRuleType("QuietHours")).toBe(false)
		expect(isVariantOverrideHouseRuleType("Parking")).toBe(false)
		expect(isVariantOverrideHouseRuleType("Children")).toBe(false)
		expect(isVariantOverrideHouseRuleType("Smoking")).toBe(true)
		expect(isVariantOverrideHouseRuleType("Access")).toBe(true)
	})
})
