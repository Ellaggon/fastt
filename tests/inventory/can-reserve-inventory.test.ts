import { describe, it, expect } from "vitest"
import { canReserveInventory } from "@/modules/inventory/application/use-cases/can-reserve-inventory"

describe("inventory/use-cases/canReserveInventory", () => {
	it("returns false when there are no days", () => {
		expect(canReserveInventory({ days: [], quantity: 1 })).toBe(false)
	})

	it("returns true when min availability across days is >= quantity", () => {
		const days = [
			{ totalInventory: 5, reservedCount: 0 }, // 5
			{ totalInventory: 5, reservedCount: 2 }, // 3 (min)
			{ totalInventory: 5, reservedCount: 1 }, // 4
		]

		expect(canReserveInventory({ days, quantity: 3 })).toBe(true)
	})

	it("returns false when min availability across days is < quantity", () => {
		const days = [
			{ totalInventory: 2, reservedCount: 0 }, // 2
			{ totalInventory: 2, reservedCount: 2 }, // 0 (min)
		]

		expect(canReserveInventory({ days, quantity: 1 })).toBe(false)
	})
})
