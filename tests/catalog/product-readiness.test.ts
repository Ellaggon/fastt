import { describe, it, expect, vi } from "vitest"
import type { ProductAggregate, ProductRepositoryPort } from "@/modules/catalog/public"
import { evaluateProductReadiness } from "@/modules/catalog/public"

function makeRepo(agg: ProductAggregate | null): ProductRepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		setProductPublication: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => agg),
	}
}

describe("catalog/product/evaluateProductReadiness (unit)", () => {
	it("draft when content/location missing", async () => {
		const agg: ProductAggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				providerId: "prov_1",
				geoPlaceId: "place_1",
			},
			imagesCount: 0,
			subtypeExists: false,
			content: null,
			location: null,
			publication: { state: "draft", validationErrorsJson: null },
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadiness({ repo }, { productId: "prod_1" })

		expect(res.state).toBe("draft")
		expect(res.validationErrors.length).toBeGreaterThan(0)
		expect(repo.setProductPublication).toHaveBeenCalledWith({
			productId: "prod_1",
			state: "draft",
			validationErrorsJson: expect.any(Array),
		})
	})

	it("ready when content has highlights and location has coords", async () => {
		const agg: ProductAggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				providerId: "prov_1",
				geoPlaceId: "place_1",
			},
			imagesCount: 1,
			subtypeExists: true,
			content: {
				productId: "prod_1",
				highlightsJson: ["h1"],
				seoJson: null,
			},
			location: {
				productId: "prod_1",
				address: null,
				lat: -16.5,
				lng: -68.13,
			},
			verticalReadiness: {
				kind: "hotel",
				subtypeExists: true,
				hotel: {
					variantCount: 1,
					completeRoomCount: 1,
				},
			},
			publication: { state: "draft", validationErrorsJson: null },
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadiness({ repo }, { productId: "prod_1" })

		expect(res.state).toBe("ready")
		expect(res.validationErrors).toEqual([])
		expect(repo.setProductPublication).toHaveBeenCalledWith({
			productId: "prod_1",
			state: "ready",
			validationErrorsJson: null,
		})
	})

	it("draft when hotel rooms are missing", async () => {
		const agg: ProductAggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				providerId: "prov_1",
				geoPlaceId: "place_1",
			},
			imagesCount: 1,
			subtypeExists: true,
			content: {
				productId: "prod_1",
				highlightsJson: ["h1"],
				seoJson: null,
			},
			location: {
				productId: "prod_1",
				address: null,
				lat: -16.5,
				lng: -68.13,
			},
			verticalReadiness: {
				kind: "hotel",
				subtypeExists: true,
				hotel: {
					variantCount: 0,
					completeRoomCount: 0,
				},
			},
			publication: { state: "draft", validationErrorsJson: null },
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadiness({ repo }, { productId: "prod_1" })

		expect(res.state).toBe("draft")
		expect(res.validationErrors.some((error) => error.code === "missing_hotel_rooms")).toBe(true)
	})

	it("keeps publication in draft when the canonical commercial check reports a blocker", async () => {
		const agg: ProductAggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				providerId: "prov_1",
				geoPlaceId: "place_1",
			},
			imagesCount: 1,
			subtypeExists: true,
			content: {
				productId: "prod_1",
				highlightsJson: ["h1"],
				seoJson: null,
			},
			location: {
				productId: "prod_1",
				address: null,
				lat: -16.5,
				lng: -68.13,
			},
			verticalReadiness: {
				kind: "hotel",
				subtypeExists: true,
				hotel: {
					variantCount: 1,
					completeRoomCount: 1,
				},
			},
			publication: { state: "draft", validationErrorsJson: null },
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadiness(
			{
				repo,
				resolvePublicationValidationErrors: vi.fn(async () => [
					{
						code: "missing_sellable_room",
						message: "Completa fotos, tarifa, condiciones y disponibilidad.",
					},
				]),
			},
			{ productId: "prod_1" }
		)

		expect(res.state).toBe("draft")
		expect(res.validationErrors).toContainEqual({
			code: "missing_sellable_room",
			message: "Completa fotos, tarifa, condiciones y disponibilidad.",
		})
	})
})
