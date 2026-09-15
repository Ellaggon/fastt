import { describe, expect, it } from "vitest"
import { assertWholeHomeUnitContract, type WholeHomeUnitDraft } from "@/lib/whole-home/unit-contract"

const valid: WholeHomeUnitDraft = {
	productId: "p", productType: "whole_home", providerId: "owner", variantId: "v",
	variantKind: "whole_home", variantProductId: "p", resourceId: "r",
	resourceVariantId: "v", resourceProviderId: "owner", unitCount: 1, exclusiveUse: true,
}

describe("whole-home physical unit contract", () => {
	it("accepts a single exclusive dwelling linked to its own resource", () => {
		expect(() => assertWholeHomeUnitContract(valid)).not.toThrow()
	})
	it("rejects room sale or multiple simultaneous units", () => {
		expect(() => assertWholeHomeUnitContract({ ...valid, variantKind: "hotel_room" })).toThrow("WHOLE_HOME_KIND_REQUIRED")
		expect(() => assertWholeHomeUnitContract({ ...valid, unitCount: 2 })).toThrow("WHOLE_HOME_EXCLUSIVE_UNIT_REQUIRED")
	})
	it("rejects a resource owned by another listing or provider", () => {
		expect(() => assertWholeHomeUnitContract({ ...valid, resourceVariantId: "other" })).toThrow("WHOLE_HOME_PHYSICAL_RESOURCE_MISMATCH")
		expect(() => assertWholeHomeUnitContract({ ...valid, resourceProviderId: "other" })).toThrow("WHOLE_HOME_PHYSICAL_RESOURCE_MISMATCH")
	})
})
