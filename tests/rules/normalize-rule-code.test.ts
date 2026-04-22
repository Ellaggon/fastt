import { describe, expect, it } from "vitest"

import { normalizeRuleCode } from "@/modules/rules/application/adapters/shared"

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
