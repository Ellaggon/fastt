import { describe, expect, it } from "vitest"

import { safeRatePlanPlaybookReturn } from "@/lib/auth/returnTo"

const valid =
	"/rates/plans/d31281f5-0000-4000-8000-000000000001?playbook=launch-tour&step=conditions&flow=create&productId=df7746a8-0000-4000-8000-000000000002&variantId=32691ff6-0000-4000-8000-000000000003"

describe("safeRatePlanPlaybookReturn", () => {
	it("keeps a tour conditions return inside the playbook", () => {
		expect(safeRatePlanPlaybookReturn(valid)).toBe(valid)
		expect(
			safeRatePlanPlaybookReturn(
				valid.replace("playbook=launch-tour", "playbook=complete-to-publish")
			)
		).toContain("playbook=complete-to-publish")
	})

	it("rejects paths that would leave the guided rate-plan step", () => {
		expect(safeRatePlanPlaybookReturn("/provider/settings/verification/documents")).toBeNull()
		expect(safeRatePlanPlaybookReturn("https://evil.example/rates/plans/abc")).toBeNull()
		expect(safeRatePlanPlaybookReturn("//evil.example/rates/plans/abc")).toBeNull()
		expect(
			safeRatePlanPlaybookReturn(
				"/rates/plans/d31281f5-0000-4000-8000-000000000001?playbook=launch&productId=df7746a8-0000-4000-8000-000000000002"
			)
		).toBeNull()
		expect(
			safeRatePlanPlaybookReturn(
				"/rates/plans/d31281f5-0000-4000-8000-000000000001?playbook=launch-tour&step=conditions"
			)
		).toBeNull()
	})
})
