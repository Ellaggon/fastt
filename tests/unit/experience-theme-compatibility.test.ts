import { expect, it } from "vitest"
import { experienceThemeCompatibility } from "@/shared/domain/experience-theme-compatibility"
const family = (id: string) => ({
	id,
	classificationKind: "family",
	vertical: "tour",
	dataClass: "production",
	isActive: true,
})
const activity = {
	...family("a"),
	classificationKind: "activity",
	parentCategoryId: "main",
	allowedAdditionalThemeIds: ["main", "secondary", "inactive"],
	themeCompatibilityRevision: 2,
}
it("only allows explicitly compatible active secondary families", () => {
	const c = experienceThemeCompatibility(
		activity,
		[
			family("main"),
			family("secondary"),
			{ ...family("inactive"), isActive: false },
			family("unrelated"),
		],
		["main", "secondary", "unrelated", "secondary"]
	)
	expect(c.availableIds).toEqual(["secondary"])
	expect(c.validIds).toEqual(["secondary"])
	expect(c.invalidIds).toEqual(["main", "unrelated"])
	expect(c.revision).toBe(2)
})
it("does not suggest themes without an active configured activity", () => {
	expect(experienceThemeCompatibility(null, [family("secondary")]).availableIds).toEqual([])
	expect(
		experienceThemeCompatibility({ ...activity, isActive: false }, [family("secondary")])
			.availableIds
	).toEqual([])
})
it("never crosses vertical or data classification", () => {
	expect(
		experienceThemeCompatibility(activity, [{ ...family("secondary"), vertical: "hotel" }])
			.availableIds
	).toEqual([])
	expect(
		experienceThemeCompatibility(activity, [{ ...family("secondary"), dataClass: "fixture" }])
			.availableIds
	).toEqual([])
})
