import { describe, expect, it } from "vitest"
import { canUseCommandCenterDecisionForCase } from "@/config/featureFlags"

describe("Command Center decision scope", () => {
	it.each(["active", "draft", null])("does not require cohort membership for %s", (providerStatus) => {
		expect(canUseCommandCenterDecisionForCase({ providerStatus })).toBe(true)
	})
	it("keeps archived providers read-only", () => {
		expect(canUseCommandCenterDecisionForCase({ providerStatus: "archived" })).toBe(false)
	})
})
