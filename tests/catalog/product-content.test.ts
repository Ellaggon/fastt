import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProductRepositoryPort } from "@/modules/catalog/public"
import { upsertProductContent } from "@/modules/catalog/public"

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

describe("catalog/product/upsertProductContent (unit)", () => {
	it("fails without highlights", async () => {
		const repo = makeRepo()
		await expect(
			upsertProductContent(
				{ repo },
				{
					productId: "prod_1",
					highlightsJson: "[]",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("accepts plain text highlights (newline separated)", async () => {
		const repo = makeRepo({
			upsertProductContent: vi.fn(async () => {}),
		})

		await upsertProductContent(
			{ repo },
			{
				productId: "prod_plain",
				highlightsJson: "Great location\nBreakfast included",
			}
		)

		expect(repo.upsertProductContent).toHaveBeenCalledWith({
			productId: "prod_plain",
			highlightsJson: ["Great location", "Breakfast included"],
			rules: null,
			seoJson: null,
		})
	})

	it("rejects non-array JSON (object)", async () => {
		const repo = makeRepo()
		await expect(
			upsertProductContent(
				{ repo },
				{
					productId: "prod_obj",
					highlightsJson: JSON.stringify({ a: 1 }),
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("rejects invalid JSON when it looks like an array", async () => {
		const repo = makeRepo()
		await expect(
			upsertProductContent(
				{ repo },
				{
					productId: "prod_bad_json",
					highlightsJson: "[not-json",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("upserts content with highlights", async () => {
		const repo = makeRepo({
			upsertProductContent: vi.fn(async () => {}),
		})

		const res = await upsertProductContent(
			{ repo },
			{
				productId: "prod_abc",
				highlightsJson: JSON.stringify(["Great location"]),
				rules: "No smoking",
			}
		)

		expect(repo.upsertProductContent).toHaveBeenCalledTimes(1)
		expect(repo.upsertProductContent).toHaveBeenCalledWith({
			productId: "prod_abc",
			highlightsJson: ["Great location"],
			rules: "No smoking",
			seoJson: null,
		})
		expect(res).toEqual({ productId: "prod_abc" })
	})
})
