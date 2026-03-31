import { describe, it, expect, vi } from "vitest"
import type { ProductV2Aggregate, ProductV2RepositoryPort } from "@/modules/catalog/public"
import { evaluateProductReadinessV2 } from "@/modules/catalog/public"

function makeRepo(agg: ProductV2Aggregate | null): ProductV2RepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		upsertProductStatus: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => agg),
	}
}

describe("catalog/product-v2/evaluateProductReadinessV2 (unit)", () => {
	it("draft when content/location missing", async () => {
		const agg: ProductV2Aggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				description: null,
				providerId: "prov_1",
				destinationId: "dest_1",
			},
			imagesCount: 0,
			subtypeExists: false,
			content: null,
			location: null,
			status: null,
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadinessV2({ repo }, { productId: "prod_1" })

		expect(res.state).toBe("draft")
		expect(res.validationErrors.length).toBeGreaterThan(0)
		expect(repo.upsertProductStatus).toHaveBeenCalledWith({
			productId: "prod_1",
			state: "draft",
			validationErrorsJson: expect.any(Array),
		})
	})

	it("ready when content has highlights and location has coords", async () => {
		const agg: ProductV2Aggregate = {
			product: {
				id: "prod_1",
				name: "P",
				productType: "Hotel",
				description: null,
				providerId: "prov_1",
				destinationId: "dest_1",
			},
			imagesCount: 1,
			subtypeExists: true,
			content: {
				productId: "prod_1",
				highlightsJson: ["h1"],
				rules: null,
				seoJson: null,
			},
			location: {
				productId: "prod_1",
				address: null,
				lat: -16.5,
				lng: -68.13,
			},
			status: null,
		}
		const repo = makeRepo(agg)

		const res = await evaluateProductReadinessV2({ repo }, { productId: "prod_1" })

		expect(res.state).toBe("ready")
		expect(res.validationErrors).toEqual([])
		expect(repo.upsertProductStatus).toHaveBeenCalledWith({
			productId: "prod_1",
			state: "ready",
			validationErrorsJson: null,
		})
	})
})
