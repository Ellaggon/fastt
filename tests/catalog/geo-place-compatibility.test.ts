import { describe, expect, it } from "vitest"

import { geoPlaceCompatibilityError, isGeoPlaceCompatible } from "@/modules/catalog/domain/geo-place-compatibility"

describe("geo-place primary discovery compatibility", () => {
	it("allows point places for accommodations", () => {
		expect(isGeoPlaceCompatible({ productType: "hotel", placeType: "city" })).toBe(true)
		expect(isGeoPlaceCompatible({ productType: "hotel", placeType: "poi" })).toBe(true)
	})

	it("allows natural areas only for experiences that can operate there", () => {
		expect(isGeoPlaceCompatible({ productType: "tour", placeType: "natural_area" })).toBe(true)
		expect(isGeoPlaceCompatible({ productType: "hotel", placeType: "natural_area" })).toBe(false)
	})

	it("rejects country and secondary administrative areas as primary discovery places", () => {
		expect(geoPlaceCompatibilityError({ productType: "hotel", placeType: "country" })).toBeTruthy()
		expect(geoPlaceCompatibilityError({ productType: "tour", placeType: "admin_area_2" })).toBeTruthy()
	})

	it("allows a bounded commercial region only for packages and transfers", () => {
		expect(isGeoPlaceCompatible({ productType: "package", placeType: "admin_area_1" })).toBe(true)
		expect(isGeoPlaceCompatible({ productType: "limousine", placeType: "admin_area_1" })).toBe(true)
		expect(isGeoPlaceCompatible({ productType: "hotel", placeType: "admin_area_1" })).toBe(false)
	})
})
