import { describe, expect, it } from "vitest"
import { parseTourComplianceContext } from "@/lib/tours/tour-compliance-context"
import { tourTerritoryCodes } from "@/lib/tours/tour-operating-territories"

describe("experience territories", () => {
	it("keeps all selected departments and removes duplicates", () => {
		const result = parseTourComplianceContext({
			operatingRole: "guide",
			activityClasses: ["urban_cultural"],
			jurisdictionCodes: ["BO-LP", "BO-OR", "BO-LP"],
		})
		expect(result.jurisdictionCodes).toEqual(["BO-LP", "BO-OR"])
	})
	it("rejects oversized identifiers before database validation", () => {
		expect(() => parseTourComplianceContext({ jurisdictionCodes: ["x".repeat(201)] })).toThrow(
			"invalid_tour_jurisdiction"
		)
	})
	it("reads the existing single-department declaration", () => {
		expect(tourTerritoryCodes({ jurisdictionCode: "BO-LP" })).toEqual(["BO-LP"])
		expect(
			tourTerritoryCodes({ jurisdictionCodes: ["BO-LP", "BO-OR"], jurisdictionCode: "BO-LP" })
		).toEqual(["BO-LP", "BO-OR"])
	})
})
