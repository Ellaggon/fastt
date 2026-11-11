import { describe, expect, it } from "vitest"
import { prepareLaPazReviewPackage } from "@/lib/commercial-policy/la-paz-review-package"

describe("La Paz administrative review preparation", () => {
	it("prepares validated specific definitions without activation or synthetic references", () => {
		const result = prepareLaPazReviewPackage()
		expect(result.activationAuthorized).toBe(false)
		expect(result.sourceKind).toBe("fastt_policy")
		expect(result.sourceReference).not.toContain("SYNTHETIC")
		expect(result.definitions.map((item) => item.key)).toEqual(expect.arrayContaining([
			"bo.tour.liability_insurance",
			"bo.tour.route_applicability_review",
		]))
		expect(result.definitions).toHaveLength(7)
		for (const keys of Object.values(result.ruleDefinitions))
			for (const key of keys)
				expect(result.definitions.some((item) => item.key === key)).toBe(true)
		expect(result.definitions[0]?.capture.expiresAt).toBe("required")
		expect(result.ruleDefinitions.regulated_place).toEqual(["bo.tour.route_applicability_review"])
		expect(result.ruleDefinitions.platform_standards).toEqual(["bo.tour.operational_safety", "bo.tour.liability_insurance"])
	})
	it("keeps unresolved applicability and sufficiency in human review", () => {
		const { humanReview, limitations } = prepareLaPazReviewPackage()
		expect(humanReview.insurance).toContain("risk_based_sufficiency_rationale")
		expect(humanReview.insurance).toContain("separate_accident_assistance_applicability")
		expect(humanReview.uncertainty).toBe("pending_blocks_new_sales")
		expect(humanReview.changesRequireReview).toBe(true)
		expect(limitations).toContain("human_review_not_automatically_enforced_by_capture_schema")
	})
})
