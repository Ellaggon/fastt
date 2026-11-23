import { describe, expect, it } from "vitest"
import { canUseCommandCenterDecisionForCase } from "@/config/featureFlags"
describe("Command Center decision scope", () => {
	const env = { COMMAND_CENTER_V2_PILOT_PROVIDER_IDS: " enabled , other " }
	it("allows a configured provider with a verified status", () => {
		expect(
			canUseCommandCenterDecisionForCase({ providerId: "enabled", providerStatus: "active" }, env)
		).toBe(true)
	})
	it.each([null, "archived"])("denies unavailable status %s", (providerStatus) => {
		expect(canUseCommandCenterDecisionForCase({ providerId: "enabled", providerStatus }, env)).toBe(
			false
		)
	})
	it("denies providers outside the cohort and empty configuration", () => {
		expect(
			canUseCommandCenterDecisionForCase({ providerId: "outside", providerStatus: "active" }, env)
		).toBe(false)
		expect(
			canUseCommandCenterDecisionForCase({ providerId: "enabled", providerStatus: "active" }, {})
		).toBe(false)
	})
})
