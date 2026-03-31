import { describe, it, expect } from "vitest"

import {
	createHouseRule,
	deleteHouseRule,
	listHouseRulesByProduct,
} from "@/modules/house-rules/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/house-rules (CAPA 6.5)", () => {
	it("create + listByProduct + delete", async () => {
		const destinationId = `dest_hr_${crypto.randomUUID()}`
		const productId = `prod_hr_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "House Rules Destination",
			type: "city",
			country: "CL",
			slug: `hr-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "House Rules Product",
			productType: "Hotel",
			destinationId,
		})

		const r1 = await createHouseRule({
			productId,
			type: "Children",
			description: "Children of all ages are welcome.",
		})
		const r2 = await createHouseRule({ productId, type: "Pets", description: "No pets allowed." })
		expect(r1.id).toMatch(/.+/)
		expect(r2.id).toMatch(/.+/)

		const list1 = await listHouseRulesByProduct(productId)
		expect(list1.length).toBe(2)
		expect(list1.some((r) => r.type === "Children")).toBe(true)
		expect(list1.some((r) => r.type === "Pets")).toBe(true)

		await deleteHouseRule(r1.id)
		const list2 = await listHouseRulesByProduct(productId)
		expect(list2.length).toBe(1)
		expect(list2[0].type).toBe("Pets")
	})
})
