import { describe, expect, it } from "vitest"

import { deriveProviderIntegrationOperationalState } from "@/lib/provider-integration-operational-state"

const base = {
	connectionStatus: "pending",
	accessValidated: false,
	coverageComplete: false,
	initialSyncState: "none" as const,
	hasAttention: false,
}

describe("provider integration operational state", () => {
	it.each([
		["access", base],
		["mapping", { ...base, connectionStatus: "connected", accessValidated: true }],
		[
			"ready",
			{ ...base, connectionStatus: "connected", accessValidated: true, coverageComplete: true },
		],
		[
			"initial_sync",
			{
				...base,
				connectionStatus: "connected",
				accessValidated: true,
				coverageComplete: true,
				initialSyncState: "running" as const,
			},
		],
		[
			"operational",
			{
				...base,
				connectionStatus: "connected",
				accessValidated: true,
				coverageComplete: true,
				initialSyncState: "succeeded" as const,
			},
		],
		[
			"attention",
			{
				...base,
				connectionStatus: "connected",
				accessValidated: true,
				initialSyncState: "failed" as const,
			},
		],
	] as const)("derives %s from persisted evidence", (expected, input) => {
		expect(deriveProviderIntegrationOperationalState(input).stage).toBe(expected)
	})

	it("gives actionable attention priority over an otherwise operational connection", () => {
		expect(
			deriveProviderIntegrationOperationalState({
				...base,
				connectionStatus: "connected",
				accessValidated: true,
				coverageComplete: true,
				initialSyncState: "succeeded",
				hasAttention: true,
			}).stage
		).toBe("attention")
	})
})
