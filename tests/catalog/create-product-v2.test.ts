import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProductV2RepositoryPort } from "@/modules/catalog/public"
import { createProductV2 } from "@/modules/catalog/public"

function makeRepo(overrides?: Partial<ProductV2RepositoryPort>): ProductV2RepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		upsertProductStatus: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => null),
		...overrides,
	}
}

describe("catalog/product-v2/createProductV2 (unit)", () => {
	it("fails without name", async () => {
		const repo = makeRepo()
		await expect(
			createProductV2(
				{ repo },
				{
					id: "prod_1",
					name: "",
					productType: "Hotel",
					destinationId: "dest_1",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("creates product base and sets draft status", async () => {
		const repo = makeRepo({
			createProductBase: vi.fn(async () => {}),
			upsertProductStatus: vi.fn(async () => {}),
		})

		const res = await createProductV2(
			{ repo },
			{
				id: "prod_abc",
				name: "QA Product",
				productType: "Hotel",
				description: "desc",
				providerId: "prov_1",
				destinationId: "dest_1",
			}
		)

		expect(repo.createProductBase).toHaveBeenCalledTimes(1)
		expect(repo.createProductBase).toHaveBeenCalledWith({
			id: "prod_abc",
			name: "QA Product",
			productType: "Hotel",
			description: "desc",
			providerId: "prov_1",
			destinationId: "dest_1",
		})
		expect(repo.upsertProductStatus).toHaveBeenCalledTimes(1)
		expect(repo.upsertProductStatus).toHaveBeenCalledWith({
			productId: "prod_abc",
			state: "draft",
			validationErrorsJson: null,
		})
		expect(res).toEqual({ id: "prod_abc" })
	})
})
