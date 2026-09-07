import { describe, expect, it } from "vitest"

import { isCommandCenterV2PilotProvider } from "@/config/featureFlags"

describe("Command Center V2 pilot scope", () => {
	it("does not enable a provider when the controlled cohort is empty", () => {
		expect(
			isCommandCenterV2PilotProvider("provider_fixture", {
				env: { COMMAND_CENTER_V2_PILOT_PROVIDER_IDS: "" },
			})
		).toBe(false)
	})

	it("matches only explicitly configured fixture providers", () => {
		const env = {
			COMMAND_CENTER_V2_PILOT_PROVIDER_IDS:
				" provider_command_center_v2_certification , provider_manual_qa ",
		}
		expect(isCommandCenterV2PilotProvider("provider_command_center_v2_certification", { env })).toBe(
			true
		)
		expect(isCommandCenterV2PilotProvider("provider_production", { env })).toBe(false)
	})
})
