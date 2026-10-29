import { describe, expect, it } from "vitest"
import { allTerritoriesCovered, territoryIsCovered } from "@/shared/domain/territorial-coverage"

describe("canonical territorial coverage", () => {
	const hierarchy = {
		city: ["city", "region", "country"],
		region: ["region", "country"],
		other: ["other", "country"],
	}
	it("covers descendants, never ancestors", () => {
		expect(territoryIsCovered("city", ["region"], hierarchy)).toBe(true)
		expect(territoryIsCovered("region", ["city"], hierarchy)).toBe(false)
	})
	it("requires every declared territory", () => {
		expect(allTerritoriesCovered(["city", "other"], ["region"], hierarchy)).toBe(false)
		expect(allTerritoriesCovered(["city", "other"], ["country"], hierarchy)).toBe(true)
	})
	it("does not infer hierarchy from identifiers or missing data", () => {
		expect(territoryIsCovered("BO-LP", ["BO"])).toBe(false)
		expect(allTerritoriesCovered([], ["country"], hierarchy)).toBe(false)
		expect(territoryIsCovered("unresolved", ["country"], hierarchy)).toBe(false)
	})
	it("is independent of country-specific identifiers", () => {
		expect(territoryIsCovered("mx-city", ["mx-state"], { "mx-city": ["mx-state"] })).toBe(true)
	})
})
