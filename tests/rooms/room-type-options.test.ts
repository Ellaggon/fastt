import { describe, expect, it } from "vitest"
import { resolveRoomTypeOptions } from "@/lib/rooms/room-type-options"

describe("resolveRoomTypeOptions", () => {
	it("uses canonical order and suppresses legacy visual duplicates", () => {
		const options = resolveRoomTypeOptions([
			{ id: "legacy-double", name: "Habitación Doble", maxOccupancy: 2 },
			{ id: "suite", name: "Suite antigua", maxOccupancy: 4 },
			{ id: "double", name: "Double", maxOccupancy: 2 },
			{ id: "custom-loft", name: "Loft panorámico", maxOccupancy: 3 },
			{ id: "single", name: "Single", maxOccupancy: 1 },
		])

		expect(options.map((option) => option.id)).toEqual(["single", "double", "suite", "custom-loft"])
		expect(options.find((option) => option.id === "double")?.name).toBe("Habitación Doble")
	})

	it("keeps a selected legacy type available during edition", () => {
		const options = resolveRoomTypeOptions(
			[
				{ id: "double", name: "Habitación Doble", maxOccupancy: 2 },
				{ id: "legacy-double", name: "Habitación Doble", maxOccupancy: 2 },
			],
			"legacy-double"
		)

		expect(options.map((option) => option.id)).toEqual(["double", "legacy-double"])
	})
})
