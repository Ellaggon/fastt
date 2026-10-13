import { expect, it } from "vitest"
import {
	evaluateExperienceClassification,
	parseExperienceBusinessKinds,
} from "@/shared/domain/experience-classification"
const activity = {
	id: "ceramics",
	name: "Cerámica",
	slug: "ceramics",
	classificationKind: "activity",
	parentCategoryId: "arts",
	isActive: true,
	vertical: "tour",
	dataClass: "production",
}
it("separates legacy themes from an explicit modern activity", () => {
	expect(evaluateExperienceClassification({ hasLegacyCategory: true })).toEqual({
		status: "legacy",
		ready: true,
	})
	expect(
		evaluateExperienceClassification({ activityContractVersion: 1, hasLegacyCategory: true })
	).toEqual({ status: "missing_activity", ready: false })
	expect(
		evaluateExperienceClassification({
			activityContractVersion: 1,
			primaryActivityCategoryId: "ceramics",
			primaryActivity: activity,
		})
	).toEqual({ status: "ready", ready: true })
})
it.each([
	{ isActive: false },
	{ vertical: "lodging" },
	{ dataClass: "fixture" },
	{ classificationKind: "family" },
	{ id: "different" },
])("does not count an inapplicable selection %j", (patch) => {
	expect(
		evaluateExperienceClassification({
			activityContractVersion: 1,
			primaryActivityCategoryId: "ceramics",
			primaryActivity: { ...activity, ...patch },
		}).ready
	).toBe(false)
})
it("accepts multiple descriptive business kinds without operational roles", () => {
	expect(parseExperienceBusinessKinds(["producer", "school", "producer"])).toEqual([
		"producer",
		"school",
	])
	expect(() => parseExperienceBusinessKinds(["instructor"])).toThrow()
	expect(() => parseExperienceBusinessKinds(null)).toThrow()
	expect(() => parseExperienceBusinessKinds(["toString"])).toThrow()
})
