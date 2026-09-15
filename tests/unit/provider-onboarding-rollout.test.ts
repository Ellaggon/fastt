import { describe, expect, it } from "vitest"

import {
	providerOnboardingLegacyHref,
	providerOnboardingRolloutBucket,
	resolveProviderOnboardingRollout,
} from "@/lib/onboarding/providerOnboardingRollout"

describe("provider onboarding rollout", () => {
	it("fails closed by default and supports an env-only kill switch", () => {
		expect(resolveProviderOnboardingRollout({ userId: "u1", env: {} })).toMatchObject({
		enabled: false,
		stage: "off",
		reason: "stage_off",
	})
		expect(
		resolveProviderOnboardingRollout({ userId: "u1", env: { PROVIDER_ONBOARDING_ENABLED: "false" } })
	).toMatchObject({ enabled: false, reason: "kill_switch" })
	})

	it("uses explicit users before stable percentage assignment", () => {
		const env = {
			PROVIDER_ONBOARDING_ROLLOUT_STAGE: "percentage",
			PROVIDER_ONBOARDING_ROLLOUT_PERCENT: "0",
			PROVIDER_ONBOARDING_USER_ALLOWLIST: "pilot-user",
		}
		expect(resolveProviderOnboardingRollout({ userId: "pilot-user", env })).toMatchObject({
			enabled: true,
			reason: "allowlist",
		})
		expect(resolveProviderOnboardingRollout({ userId: "control-user", env })).toMatchObject({
			enabled: false,
			reason: "outside_percentage",
		})
		expect(providerOnboardingRolloutBucket("control-user")).toBe(
		providerOnboardingRolloutBucket("control-user")
	)
	})

	it("fails closed outside staging and retains a legacy route without data deletion", () => {
		expect(
		resolveProviderOnboardingRollout({
			userId: "u1",
			host: "production.example",
			env: { PROVIDER_ONBOARDING_ROLLOUT_STAGE: "staging", PROVIDER_ONBOARDING_STAGING_HOSTS: "staging.fastt.test" },
		})
	).toMatchObject({ enabled: false, reason: "not_staging_host" })
		expect(providerOnboardingLegacyHref()).toBe("/provider/settings/profile?onboarding=legacy")
	})
})
