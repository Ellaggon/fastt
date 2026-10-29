import { describe, expect, it } from "vitest"
import { commercialPolicyDraftSchema } from "@/lib/commercial-policy/policy-drafts"

const draft = {
	country: "BO",
	jurisdictionRole: "product",
	holderType: "persona_natural",
	effectiveFrom: "2026-10-28",
	effectiveTo: null,
	operatingRoles: ["guide"],
	activityClasses: ["urban_cultural"],
	experienceFormats: ["guided_tour"],
	jurisdictionCodes: ["BO-LP"],
}
describe("policy validity dates", () => {
	it("allows an indefinite policy", () => {
		const result = commercialPolicyDraftSchema.safeParse(draft)
		expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
	})
	it("rejects an end before the start", () => {
		expect(
			commercialPolicyDraftSchema.safeParse({ ...draft, effectiveTo: "2026-10-27" }).success
		).toBe(false)
	})
	it("allows a scheduled policy with an optional end", () => {
		expect(
			commercialPolicyDraftSchema.safeParse({
				...draft,
				effectiveFrom: "2027-01-01",
				effectiveTo: "2027-12-31",
			}).success
		).toBe(true)
	})
})
