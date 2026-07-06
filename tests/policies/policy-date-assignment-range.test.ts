import { describe, expect, it } from "vitest"
import { planPolicyDateAssignmentRangeChange } from "@/modules/policies/application/use-cases/replace-policy-date-assignment-range"

const createdAt = new Date("2026-07-04T12:00:00.000Z")

function assignment(from: string, to: string) {
	return {
		id: "assignment-a",
		policyGroupId: "group-a",
		effectiveFrom: from,
		effectiveTo: to,
		createdAt,
	}
}

describe("policy date assignment range replacement", () => {
	it("splits an existing range around a replacement", () => {
		const plan = planPolicyDateAssignmentRangeChange({
			existing: [assignment("2026-06-01", "2026-06-30")],
			effectiveFrom: "2026-06-10",
			effectiveTo: "2026-06-15",
			replacementPolicyGroupId: "group-b",
		})

		expect(plan.deactivateIds).toEqual(["assignment-a"])
		expect(plan.preservedSegments).toEqual([
			expect.objectContaining({
				policyGroupId: "group-a",
				effectiveFrom: "2026-06-01",
				effectiveTo: "2026-06-09",
			}),
			expect.objectContaining({
				policyGroupId: "group-a",
				effectiveFrom: "2026-06-16",
				effectiveTo: "2026-06-30",
			}),
		])
		expect(plan.replacement).toEqual({
			policyGroupId: "group-b",
			effectiveFrom: "2026-06-10",
			effectiveTo: "2026-06-15",
		})
	})

	it("keeps only the unaffected side of a partial overlap", () => {
		const plan = planPolicyDateAssignmentRangeChange({
			existing: [assignment("2026-06-01", "2026-06-12")],
			effectiveFrom: "2026-06-10",
			effectiveTo: "2026-06-20",
			replacementPolicyGroupId: "group-b",
		})

		expect(plan.preservedSegments).toEqual([
			expect.objectContaining({
				effectiveFrom: "2026-06-01",
				effectiveTo: "2026-06-09",
			}),
		])
	})

	it("restores the base by removing the selected portion without adding a replacement", () => {
		const plan = planPolicyDateAssignmentRangeChange({
			existing: [assignment("2026-06-01", "2026-06-30")],
			effectiveFrom: "2026-06-10",
			effectiveTo: "2026-06-15",
			replacementPolicyGroupId: null,
		})

		expect(plan.deactivateIds).toEqual(["assignment-a"])
		expect(plan.preservedSegments).toHaveLength(2)
		expect(plan.replacement).toBeNull()
	})

	it("does not alter ranges outside the selected period", () => {
		const plan = planPolicyDateAssignmentRangeChange({
			existing: [assignment("2026-05-01", "2026-05-31")],
			effectiveFrom: "2026-06-10",
			effectiveTo: "2026-06-15",
			replacementPolicyGroupId: "group-b",
		})

		expect(plan.deactivateIds).toEqual([])
		expect(plan.preservedSegments).toEqual([])
		expect(plan.replacement?.policyGroupId).toBe("group-b")
	})
})
