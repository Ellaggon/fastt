import { describe, expect, it } from "vitest"

import { mapResolvedPoliciesToRules } from "@/modules/rules/public"

function normalizeRuleCode(value: string) {
	const rules = mapResolvedPoliciesToRules({
		resolved: {
			policies: [
				{
					category: value,
					resolvedFromScope: "product",
					policy: {
						id: `policy_${value}`,
						version: 1,
						status: "active",
						description: "test",
						rules: [],
						cancellationTiers: [],
					},
				},
			],
		} as any,
		context: { productId: "prod_test" },
		now: new Date("2026-01-01T00:00:00.000Z"),
	})
	return rules[0]?.group.code
}

describe("rules/normalizeRuleCode", () => {
	it("maps legacy policy category aliases into canonical contract rule codes", () => {
		expect(normalizeRuleCode("CancellationPolicy")).toBe("cancellation")
		expect(normalizeRuleCode("payment_policy")).toBe("payment")
		expect(normalizeRuleCode("NoShowPolicy")).toBe("no_show")
		expect(normalizeRuleCode("CheckInPolicy")).toBe("check_in")
		expect(normalizeRuleCode("check_out_policy")).toBe("check_out")
	})

	it("keeps known hard-constraint aliases normalized", () => {
		expect(normalizeRuleCode("minstay")).toBe("min_stay")
		expect(normalizeRuleCode("stopSell")).toBe("stop_sell")
	})
})
