import { describe, it, expect } from "vitest"
import { dailyInventoryRepository, inventoryRepository } from "@/container"
import { seedTestProductVariant } from "@/shared/infrastructure/test-support/db-test-data"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"

describe("integration/inventory flow", () => {
	it("seeds inventory and materializes effective availability deterministically", async () => {
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
		})

		await dailyInventoryRepository.upsert({
			id: "di_variant_int_inventory_2026-03-11",
			variantId,
			date: "2026-03-11",
			totalInventory: 5,
			reservedCount: 3,
		})

		await recomputeEffectiveAvailabilityRange({
			variantId,
			from: "2026-03-10",
			to: "2026-03-12",
			reason: "inventory_flow_test",
			idempotencyKey: "inventory_flow_test:variant_int_inventory:2026-03-10:2026-03-12",
		})

		const range = await inventoryRepository.getEffectiveRange(
			variantId,
			new Date("2026-03-10"),
			new Date("2026-03-12")
		)

		expect(range).toHaveLength(2)
		expect(range[0]?.availableUnits).toBe(5)
		expect(range[0]?.isSellable).toBe(true)
		expect(range[1]?.availableUnits).toBe(5)
		expect(range[1]?.isSellable).toBe(true)
	})
})
