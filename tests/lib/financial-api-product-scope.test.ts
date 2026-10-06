import { describe, expect, it } from "vitest"

import { resolveWorkspaceScope } from "@/lib/workspace/resolveWorkspaceScope"

describe("financial API product scope resolution", () => {
	it("derives tour product ids for scoped booking queries", () => {
		const resolution = resolveWorkspaceScope({
			productTypes: ["Hotel", "Tour"],
			commercialLines: ["lodging", "tour"],
			requestedScope: "tour",
			products: [
				{ id: "hotel_1", name: "Hotel", productType: "hotel" },
				{ id: "tour_1", name: "Walk", productType: "tour" },
				{ id: "tour_2", name: "Ride", productType: "tour" },
			],
		})
		expect(resolution).toMatchObject({
			valid: true,
			vertical: "tour",
			product: null,
			productIds: ["tour_1", "tour_2"],
		})
	})

	it("narrows to one product when productId is present", () => {
		const resolution = resolveWorkspaceScope({
			productTypes: ["Tour"],
			requestedScope: "tour",
			productId: "tour_2",
			products: [
				{ id: "tour_1", name: "Walk", productType: "tour" },
				{ id: "tour_2", name: "Ride", productType: "tour" },
			],
		})
		expect(resolution).toMatchObject({
			valid: true,
			product: { id: "tour_2" },
			productIds: ["tour_1", "tour_2"],
		})
	})
})
