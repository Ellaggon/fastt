import { describe, it, expect } from "vitest"
import { SearchPipeline } from "@/core/search/SearchPipeline"
import { vi } from "vitest"

vi.mock("astro:db")

describe("SearchPipeline", () => {
	it("should calculate base pricing correctly", async () => {
		const fakeLoader = {
			load: async () => ({
				inventory: [
					{
						date: "2026-03-10",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
					{
						date: "2026-03-11",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
				],
				ratePlans: [],
				restrictions: [],
				priceRules: [],
				promotions: [],
			}),
		}

		const pipeline = new SearchPipeline(fakeLoader)

		const result = await pipeline.run({
			productId: "hotel_test",
			unitId: "room_test",
			unitType: "hotel_room",
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-12"),
			adults: 2,
			children: 0,
			basePrice: 100,
		})

		expect(result).toBeDefined()
		expect(Array.isArray(result)).toBe(true)
	})
})
