import { describe, it, expect } from "vitest"

import { mapResolvedPoliciesToUI } from "@/modules/policies/public"
import type { PolicyResolutionDTO } from "@/modules/policies/public"

describe("policies/mapResolvedPoliciesToUI", () => {
	it("maps canonical resolver output to hotel UI shape (category + description + version + scope)", () => {
		const resolved: PolicyResolutionDTO = {
			version: "v2",
			policies: [
				{
					category: "HouseRules",
					policy: { id: "p1", description: "No smoking", version: 2 } as any,
					resolvedFromScope: "product",
				},
			],
			missingCategories: [],
			coverage: { hasFullCoverage: true },
			asOfDate: "2030-01-01",
			warnings: [],
		}
		const ui = mapResolvedPoliciesToUI(resolved)
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
		expect(
			mapResolvedPoliciesToUI({
				version: "v2",
				policies: [],
				missingCategories: [],
				coverage: { hasFullCoverage: false },
				asOfDate: "2030-01-01",
				warnings: [],
			})
		).toEqual([])
		expect(mapResolvedPoliciesToUI({} as any)).toEqual([])
	})
})
