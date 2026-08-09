import { describe, expect, it } from "vitest"

import { minStayUpdateForProperty } from "@/lib/channel-manager/channel-manager-restrictions"

describe("Channex min-stay serialization", () => {
	it("uses the property-supported field instead of an invalid virtual min_stay", () => {
		expect(minStayUpdateForProperty(3, "arrival")).toEqual({ minStayArrival: 3 })
		expect(minStayUpdateForProperty(3, "through")).toEqual({ minStayThrough: 3 })
		expect(minStayUpdateForProperty(3, "both")).toEqual({ minStayArrival: 3, minStayThrough: 3 })
		expect(minStayUpdateForProperty(3, null)).toEqual({ minStay: 3 })
	})
})
