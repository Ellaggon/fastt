import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProductRepositoryPort } from "@/modules/catalog/public"
import { createProduct } from "@/modules/catalog/public"

function makeRepo(overrides?: Partial<ProductRepositoryPort>): ProductRepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		setProductPublication: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => null),
		getProductById: vi.fn(async () => null),
		...overrides,
	}
}

describe("catalog/product/createProduct (unit)", () => {
	it("fails without name", async () => {
		const repo = makeRepo()
		await expect(
			createProduct(
				{ repo },
				{
					id: "prod_1",
					name: "",
					productType: "Hotel",
					providerId: "prov_1",
					geoPlaceId: "geo_1",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("creates product base with the required draft publication state", async () => {
		const repo = makeRepo({
			createProductBase: vi.fn(async () => {}),
		})

		const res = await createProduct(
			{ repo },
			{
				id: "prod_abc",
				name: "QA Product",
				productType: "Hotel",
				providerId: "prov_1",
				geoPlaceId: "geo_1",
			}
		)

		expect(repo.createProductBase).toHaveBeenCalledTimes(1)
		expect(repo.createProductBase).toHaveBeenCalledWith({
			id: "prod_abc",
			name: "QA Product",
			productType: "hotel",
			providerId: "prov_1",
			geoPlaceId: "geo_1",
		})
		expect(repo.setProductPublication).not.toHaveBeenCalled()
		expect(res).toEqual({ id: "prod_abc" })
	})

	it("stores productType in its canonical database representation", async () => {
		const repo = makeRepo({
			createProductBase: vi.fn(async () => {}),
		})

		await createProduct(
			{ repo },
			{
				id: "prod_lower",
				name: "QA Product",
				productType: "hotel",
				providerId: "prov_1",
				geoPlaceId: "geo_1",
			}
		)

		expect(repo.createProductBase).toHaveBeenCalledWith({
			id: "prod_lower",
			name: "QA Product",
			productType: "hotel",
			providerId: "prov_1",
				geoPlaceId: "geo_1",
		})
	})
})
