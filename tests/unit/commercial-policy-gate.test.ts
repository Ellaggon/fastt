import { describe, expect, it } from "vitest"

import { commercialPolicyEnforcementDecision } from "@/lib/commercial-policy/gate"

describe("commercial policy enforcement gate", () => {
	it("keeps hotels outside the tour-only gate while rollout is off", () => {
		expect(commercialPolicyEnforcementDecision({ forceForTour: true, rolloutEnabled: false })).toBe(
			"continue"
		)
		for (const vertical of ["hotel", "whole_home"] as const) {
			expect(
				commercialPolicyEnforcementDecision({ forceForTour: true, rolloutEnabled: false, vertical })
			).toBe("skip")
		}
		expect(
			commercialPolicyEnforcementDecision({
				forceForTour: true,
				rolloutEnabled: false,
				vertical: "tour",
			})
		).toBe("continue")
		expect(commercialPolicyEnforcementDecision({ rolloutEnabled: false })).toBe("skip")
		expect(
			commercialPolicyEnforcementDecision({ force: true, rolloutEnabled: false, vertical: "hotel" })
		).toBe("continue")
	})
})
