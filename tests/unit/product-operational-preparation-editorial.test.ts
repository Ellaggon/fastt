import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rows: vi.fn(), select: vi.fn(), summary: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	db: { select: mocks.select },
	Product: { id: "id", providerId: "providerId", publicationState: "publicationState" },
	ProductOperationalSurface: {},
	and: (...conditions: unknown[]) => conditions,
	eq: (column: string, value: unknown) => ({ column, value }),
	inArray: (column: string, value: unknown) => ({ column, value }),
	first: vi.fn(),
}))
vi.mock("@/lib/playbook/summarize-product-preparation", () => ({
	summarizeProductPreparation: mocks.summary,
}))
vi.mock("@/modules/catalog/public", () => ({
	getProductFullAggregate: vi.fn(),
	getProductVariantsAggregate: vi.fn(),
}))
vi.mock("@/modules/policies/public", () => ({
	derivePolicySummaryFromResolvedPolicies: vi.fn(),
	resolveEffectivePolicies: vi.fn(),
	summarizeMissingPolicyCategories: vi.fn(),
}))
vi.mock("@/modules/pricing/public", () => ({ listRatePlansByProvider: vi.fn() }))

import { listProductOperationalPreparation } from "@/lib/product/productOperationalSurface"

beforeEach(() => {
	vi.clearAllMocks()
	mocks.select.mockReturnValue({ from: () => ({ where: mocks.rows }) })
	mocks.summary.mockImplementation(async (input) => ({
		...input,
		isPublished: input.status === "published",
	}))
})

describe("batch preparation preserves authoritative editorial state", () => {
	it("loads published shared/private and draft states once, retaining each saved offer", async () => {
		mocks.rows.mockResolvedValue([
			{ productId: "shared", status: "published" },
			{ productId: "private", status: "published" },
			{ productId: "draft", status: "draft" },
		])
		const request = new Request("http://fastt.local/dashboard")
		const lastPathByProductId = new Map([
			["shared", "/product/shared/preview?variantId=a&ratePlanId=r"],
			["private", "/product/private/preview?variantId=b&ratePlanId=s"],
		])
		const result = await listProductOperationalPreparation(
			"provider",
			["shared", "private", "draft", "shared"],
			{ request, lastPathByProductId }
		)
		expect(mocks.select).toHaveBeenCalledTimes(1)
		expect(mocks.rows).toHaveBeenCalledWith([
			{ column: "providerId", value: "provider" },
			{ column: "id", value: ["shared", "private", "draft"] },
		])
		for (const id of ["shared", "private", "draft"]) {
			expect(mocks.summary).toHaveBeenCalledWith({
				productId: id,
				providerId: "provider",
				status: id === "draft" ? "draft" : "published",
				lastPath: lastPathByProductId.get(id) ?? null,
				request,
			})
		}
		expect(result.get("shared")!.isPublished).toBe(true)
		expect(result.get("private")!.isPublished).toBe(true)
		expect(result.get("draft")!.isPublished).toBe(false)
	})
	it("does not evaluate missing or foreign products, or hide read failures as draft", async () => {
		mocks.rows.mockResolvedValue([])
		expect(await listProductOperationalPreparation("provider", ["foreign"])).toEqual(new Map())
		expect(mocks.summary).not.toHaveBeenCalled()
		mocks.rows.mockRejectedValue(new Error("read failed"))
		await expect(listProductOperationalPreparation("provider", ["tour"])).rejects.toThrow(
			"read failed"
		)
	})
	it("does not query without a provider or products", async () => {
		await listProductOperationalPreparation("", ["tour"])
		await listProductOperationalPreparation("provider", [])
		expect(mocks.select).not.toHaveBeenCalled()
	})
})
