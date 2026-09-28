import { describe, expect, it } from "vitest"

import {
	commercialPolicyRolloutBucket,
	resolveCommercialPolicyRollout,
} from "@/lib/commercial-policy/rollout"

describe("commercial policy cohort rollout", () => {
	it("fails closed unless the global switch and an explicit stage are both configured", () => {
		expect(resolveCommercialPolicyRollout({ providerId: "hotel-1", env: {} })).toMatchObject({
			enabled: false,
			reason: "kill_switch",
		})
		expect(
			resolveCommercialPolicyRollout({
				providerId: "hotel-1",
				env: { FASTT_ENFORCE_COMMERCIAL_POLICY: "true" },
			})
		).toMatchObject({ enabled: false, stage: "off", reason: "stage_off" })
	})

	it("activates a named mixed provider before percentage and general cohorts", () => {
		const env = {
			FASTT_ENFORCE_COMMERCIAL_POLICY: "true",
			FASTT_COMMERCIAL_POLICY_ROLLOUT_STAGE: "percentage",
			FASTT_COMMERCIAL_POLICY_ROLLOUT_PERCENT: "0",
			FASTT_COMMERCIAL_POLICY_PROVIDER_ALLOWLIST: "mixed-provider",
		}
		expect(resolveCommercialPolicyRollout({ providerId: "mixed-provider", env })).toMatchObject({
			enabled: true,
			cohort: "canary",
			reason: "allowlist",
		})
		expect(resolveCommercialPolicyRollout({ providerId: "hotel-control", env })).toMatchObject({
			enabled: false,
			cohort: "control",
		})
		expect(commercialPolicyRolloutBucket("hotel-control")).toBe(
			commercialPolicyRolloutBucket("hotel-control")
		)
	})

	it("does not activate staging outside its explicit environment", () => {
		expect(
			resolveCommercialPolicyRollout({
				providerId: "tour-1",
				host: "production.fastt.test",
				env: {
					FASTT_ENFORCE_COMMERCIAL_POLICY: "true",
					FASTT_COMMERCIAL_POLICY_ROLLOUT_STAGE: "staging",
					FASTT_COMMERCIAL_POLICY_STAGING_HOSTS: "staging.fastt.test",
				},
			})
		).toMatchObject({ enabled: false, reason: "not_staging_host" })
	})
})
