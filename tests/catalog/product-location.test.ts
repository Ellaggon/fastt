import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProductRepositoryPort } from "@/modules/catalog/public"
import { upsertProductLocation } from "@/modules/catalog/public"

function makeRepo(overrides?: Partial<ProductRepositoryPort>): ProductRepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		upsertProductStatus: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => null),
		...overrides,
	}
}

describe("catalog/product/upsertProductLocation (unit)", () => {
	it("fails without lat/lng", async () => {
		const repo = makeRepo()
		await expect(
			upsertProductLocation(
				{ repo },
				{
					productId: "prod_1",
					lat: "NaN",
					lng: "NaN",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("upserts location when valid", async () => {
		const repo = makeRepo({
			upsertProductLocation: vi.fn(async () => {}),
		})

		const res = await upsertProductLocation(
			{ repo },
			{
				productId: "prod_abc",
				address: "Somewhere",
				lat: "-16.5",
				lng: "-68.13",
			}
		)

		expect(repo.upsertProductLocation).toHaveBeenCalledTimes(1)
		expect(repo.upsertProductLocation).toHaveBeenCalledWith({
			productId: "prod_abc",
			address: "Somewhere",
			lat: -16.5,
			lng: -68.13,
		})
		expect(res).toEqual({ productId: "prod_abc" })
	})
})
