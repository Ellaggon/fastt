import { describe, it, expect } from "vitest"

import { mapResolvedPoliciesToUI } from "@/modules/policies/public"

describe("policies/mapResolvedPoliciesToUI", () => {
	it("maps canonical resolver output to hotel UI shape (category + description + version + scope)", () => {
		const ui = mapResolvedPoliciesToUI({
			policies: [
				{
					category: "HouseRules",
					policy: { id: "p1", description: "No smoking", version: 2 } as any,
					resolvedFromScope: "product",
				},
			],
			missingCategories: [],
		})
		expect(ui).toEqual([
			{
				category: "HouseRules",
				description: "No smoking",
				version: 2,
				resolvedFromScope: "product",
			},
		])
	})

	it("is defensive: empty or missing policies array => []", () => {
		expect(mapResolvedPoliciesToUI({ policies: [], missingCategories: [] })).toEqual([])
		expect(mapResolvedPoliciesToUI({} as any)).toEqual([])
	})
})
