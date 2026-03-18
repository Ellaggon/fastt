import { describe, it, expect } from "vitest"
import { availabilityService, dailyInventoryRepository } from "@/container"
import { seedTestProductVariant } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/inventory flow", () => {
	it("seeds inventory and answers canReserve deterministically", async () => {
		const { variantId } = await seedTestProductVariant({
			variantId: "variant_int_inventory",
			productId: "prod_int_inventory",
			destinationId: "dest_int_inventory",
			basePrice: 100,
		})

		// Two-night stay (2026-03-10, 2026-03-11). checkOut is exclusive.
		await dailyInventoryRepository.upsert({
			id: "di_variant_int_inventory_2026-03-10",
			variantId,
			date: "2026-03-10",
			totalInventory: 5,
			reservedCount: 2,
			priceOverride: null,
		})

		await dailyInventoryRepository.upsert({
			id: "di_variant_int_inventory_2026-03-11",
			variantId,
			date: "2026-03-11",
			totalInventory: 5,
			reservedCount: 3,
			priceOverride: null,
		})

		const ok = await availabilityService.canReserve(
			variantId,
			new Date("2026-03-10"),
			new Date("2026-03-12"),
			2
		)

		expect(ok).toBe(true)

		const notOk = await availabilityService.canReserve(
			variantId,
			new Date("2026-03-10"),
			new Date("2026-03-12"),
			3
		)

		expect(notOk).toBe(false)
	})
})
