import { describe, expect, it } from "vitest"

import { resolveWorkspaceScope } from "@/lib/workspace/resolveWorkspaceScope"

const mixedProducts = [
	{ id: "hotel_1", name: "Hotel Norte", productType: "hotel" },
	{ id: "tour_1", name: "City Walk", productType: "tour" },
	{ id: "tour_2", name: "Sunset Ride", productType: "tour" },
]

describe("resolveWorkspaceScope", () => {
	it("delegates invalid vertical selection to booking rules", () => {
		expect(
			resolveWorkspaceScope({
				productTypes: ["Tour"],
				requestedScope: "hotel",
				products: mixedProducts,
			})
		).toMatchObject({ valid: false, reason: "scope_unavailable" })
	})

	it("scopes finances to the whole tour line without picking the first product", () => {
		const resolution = resolveWorkspaceScope({
			productTypes: ["Hotel", "Tour"],
			commercialLines: ["lodging", "tour"],
			requestedScope: "tour",
			products: mixedProducts,
		})
		expect(resolution).toMatchObject({
			valid: true,
			vertical: "tour",
			line: "tour",
			product: null,
			productIds: ["tour_1", "tour_2"],
		})
	})

	it("refines a line scope to one owned product", () => {
		expect(
			resolveWorkspaceScope({
				productTypes: ["Hotel", "Tour"],
				requestedScope: "tour",
				productId: "tour_2",
				products: mixedProducts,
			})
		).toMatchObject({
			valid: true,
			vertical: "tour",
			product: { id: "tour_2", name: "Sunset Ride" },
			productIds: ["tour_1", "tour_2"],
		})
	})

	it("rejects a product outside the requested line", () => {
		expect(
			resolveWorkspaceScope({
				productTypes: ["Hotel", "Tour"],
				requestedScope: "tour",
				productId: "hotel_1",
				products: mixedProducts,
			})
		).toMatchObject({ valid: false, reason: "scope_product_mismatch" })
	})

	it("includes tour vocabulary for scoped tour operations", () => {
		const resolution = resolveWorkspaceScope({
			productTypes: ["Tour"],
			requestedScope: "tour",
			products: mixedProducts.filter((product) => product.productType === "tour"),
		})
		expect(resolution.valid).toBe(true)
		if (!resolution.valid) return
		expect(resolution.vocabulary.guest).toBe("participante")
		expect(resolution.vocabulary.stayWindow).toBe("Salida")
	})
})
