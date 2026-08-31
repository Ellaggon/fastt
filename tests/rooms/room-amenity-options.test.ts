import { describe, expect, it } from "vitest"
import { resolveRoomAmenityOptions } from "@/lib/rooms/room-amenity-options"

describe("resolveRoomAmenityOptions", () => {
	it("suppresses duplicate Wi-Fi options and favors the canonical option", () => {
		const options = resolveRoomAmenityOptions([
			{ id: "legacy-wifi-a", name: "Wi-Fi en la habitación", category: "Conectividad" },
			{ id: "wifi", name: "Wi-Fi en la habitación", category: "Conectividad" },
			{ id: "legacy-wifi-b", name: "Wi-Fi gratuito", category: "Conectividad" },
			{ id: "desk", name: "Escritorio", category: "Conectividad" },
		])

		expect(options.map((option) => option.id)).toEqual(["desk", "wifi"])
	})

	it("preserves a selected legacy option during room edition", () => {
		const options = resolveRoomAmenityOptions(
			[
				{ id: "wifi", name: "Wi-Fi en la habitación", category: "Conectividad" },
				{ id: "legacy-wifi", name: "Wi-Fi gratuito", category: "Conectividad" },
			],
			["legacy-wifi"]
		)

		expect(options).toEqual([
			{ id: "legacy-wifi", name: "Wi-Fi gratuito", category: "Conectividad" },
		])
	})
})
