import { describe, it, expect } from "vitest"
import { recomputeInventory } from "@/modules/inventory/application/use-cases/recompute-inventory"

describe("inventory/use-cases/recomputeInventory", () => {
	it("computes available inventory as total - reserved", () => {
		expect(recomputeInventory({ totalInventory: 10, reservedCount: 3 })).toBe(7)
	})

	it("never returns a negative number", () => {
		expect(recomputeInventory({ totalInventory: 2, reservedCount: 5 })).toBe(0)
	})
})
