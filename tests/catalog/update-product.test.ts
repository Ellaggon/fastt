import { describe, it, expect, vi } from "vitest"
import { updateProduct } from "@/modules/catalog/application/use-cases/update-product"

describe("catalog/updateProduct (unit)", () => {
	it("validates form, calls updateProductAndSubtype, and returns redirectUrl", async () => {
		const updateProductAndSubtype = vi.fn(async () => {})

		const fd = new FormData()
		fd.set("name", "Updated Name")
		fd.set("description", "Updated Desc")
		fd.set("productType", "Hotel")

		const resp = await updateProduct({
			updateProductAndSubtype,
			productId: "prod_unit_upd_1",
			providerId: "prov_unit_1",
			formData: fd,
		})

		expect(updateProductAndSubtype).toHaveBeenCalledTimes(1)
		const call = updateProductAndSubtype.mock.calls[0]!
		expect(call[0]).toBe("prod_unit_upd_1")
		expect(call[1]).toBe("prov_unit_1")
		expect(call[2]).toMatchObject({
			name: "Updated Name",
			description: "Updated Desc",
			productType: "Hotel",
		})
		expect(call[3]).toBe(undefined) // subtypeType
		expect(call[4]).toBe(undefined) // subtypePayload

		expect(resp.status).toBe(200)
		const json = await resp.json()
		expect(json).toEqual({ ok: true, redirectUrl: "/hotels/prod_unit_upd_1" })
	})

	it("returns 400 when subtype JSON is invalid (and does not call update)", async () => {
		const updateProductAndSubtype = vi.fn(async () => {})

		const fd = new FormData()
		fd.set("name", "Name")
		fd.set("productType", "Hotel")
		fd.set("subtype", "{") // invalid JSON

		const resp = await updateProduct({
			updateProductAndSubtype,
			productId: "prod_unit_upd_2",
			providerId: "prov_unit_2",
			formData: fd,
		})

		expect(updateProductAndSubtype).not.toHaveBeenCalled()
		expect(resp.status).toBe(400)
		const json = await resp.json()
		expect(json).toEqual({ error: "Invalid JSON in subtype" })
	})

	it("returns 400 when schema validation fails (and does not call update)", async () => {
		const updateProductAndSubtype = vi.fn(async () => {})

		const fd = new FormData()
		fd.set("name", "") // invalid (min 1)
		fd.set("productType", "Hotel")

		const resp = await updateProduct({
			updateProductAndSubtype,
			productId: "prod_unit_upd_3",
			providerId: "prov_unit_3",
			formData: fd,
		})

		expect(updateProductAndSubtype).not.toHaveBeenCalled()
		expect(resp.status).toBe(400)
		const json = await resp.json()
		expect(json).toHaveProperty("error")
	})
})
