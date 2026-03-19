import { describe, it, expect, vi } from "vitest"
import { createProduct } from "@/modules/catalog/application/use-cases/create-product"

describe("catalog/createProduct (unit)", () => {
	it("calls repo.createProductWithImages and returns id", async () => {
		const repo = {
			createProductWithImages: vi.fn(async () => {}),
		}

		const res = await createProduct(
			{ repo: repo as any },
			{
				id: "prod_unit_1",
				name: "Hotel X",
				description: null,
				productType: "Hotel",
				providerId: "prov_1",
				destinationId: "dest_1",
				images: ["https://example.com/a.jpg"],
			}
		)

		expect(repo.createProductWithImages).toHaveBeenCalledTimes(1)
		expect(repo.createProductWithImages).toHaveBeenCalledWith({
			id: "prod_unit_1",
			name: "Hotel X",
			description: null,
			productType: "Hotel",
			providerId: "prov_1",
			destinationId: "dest_1",
			images: ["https://example.com/a.jpg"],
		})

		expect(res).toEqual({ id: "prod_unit_1" })
	})
})
