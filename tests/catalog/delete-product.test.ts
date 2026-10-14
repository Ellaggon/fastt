import { describe, it, expect, vi } from "vitest"
import { deleteProduct } from "@/modules/catalog/public"

describe("catalog/deleteProduct (unit)", () => {
	it("returns a useful conflict for protected history", async () => {
		const { ProductDeletionBlockedError } =
			await import("@/modules/catalog/application/use-cases/delete-product")
		const response = await deleteProduct({
			ensureOwned: async () => ({ id: "p" }),
			deleteCascade: async () => {
				throw new ProductDeletionBlockedError()
			},
			productId: "p",
			providerId: "owner",
		})
		expect(response.status).toBe(409)
		expect(await response.json()).toMatchObject({ code: "history_protected" })
	})
	it("returns 403 when product is not owned", async () => {
		const ensureOwned = vi.fn(async () => null)
		const deleteCascade = vi.fn(async () => {})

		const resp = await deleteProduct({
			ensureOwned,
			deleteCascade,
			productId: "prod_unit_del_1",
			providerId: "prov_unit_1",
		})

		expect(ensureOwned).toHaveBeenCalledTimes(1)
		expect(deleteCascade).not.toHaveBeenCalled()
		expect(resp.status).toBe(403)
		expect(await resp.text()).toBe("Not found or not owned")
	})

	it("deletes product when owned and returns ok", async () => {
		const ensureOwned = vi.fn(async () => ({ id: "prod_unit_del_2" }))
		const deleteCascade = vi.fn(async () => {})

		const resp = await deleteProduct({
			ensureOwned,
			deleteCascade,
			productId: "prod_unit_del_2",
			providerId: "prov_unit_2",
		})

		expect(deleteCascade).toHaveBeenCalledTimes(1)
		expect(deleteCascade).toHaveBeenCalledWith("prod_unit_del_2")
		expect(resp.status).toBe(200)
		expect(await resp.json()).toEqual({ ok: true })
	})
})
