import { describe, it, expect } from "vitest"
import { ratePlanService } from "@/container"
import {
	seedTestProductVariant,
	seedTestRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/pricing flow", () => {
	it("selects rate plans from real repositories and engine", async () => {
		const { variantId } = await seedTestProductVariant({
			variantId: "variant_int_pricing",
			productId: "prod_int_pricing",
			destinationId: "dest_int_pricing",
			basePrice: 100,
		})

		await seedTestRatePlan({
			variantId,
			templateId: "rpt_int_pricing",
			ratePlanId: "rp_int_pricing",
			priceRuleId: "prule_int_pricing",
		})

		const candidates = await ratePlanService.getAvailableRatePlans(
			variantId,
			new Date("2026-03-10"),
			new Date("2026-03-11")
		)

		expect(candidates.length).toBeGreaterThan(0)

		const best = candidates[0]!
		expect(best.id).toBe("rp_int_pricing")
		expect(best.name).toBe("Test Rate Plan")
		expect(best.price).toBe(90)
	})
})
