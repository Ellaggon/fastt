import { describe, expect, it } from "vitest"
import {
	buildAutomaticRoomInternalCode,
	getRoomInternalCodePrefix,
	normalizeRoomInternalCode,
} from "@/lib/rooms/room-internal-code"

describe("room internal code", () => {
	it("builds a stable readable code from room type and variant id", () => {
		expect(
			buildAutomaticRoomInternalCode({
				roomTypeId: "double",
				variantId: "c5871929-8352-4156-b08b-902a5432ea1d",
			})
		).toBe("DBL-C5871929")
	})

	it("uses a safe fallback for custom room types", () => {
		expect(
			buildAutomaticRoomInternalCode({ roomTypeId: "custom", variantId: "room-123456789" })
		).toBe("ROOM-ROOM1234")
	})

	it("uses the same prefix for the client preview and server generation", () => {
		expect(getRoomInternalCodePrefix("family_suite")).toBe("FAM")
		expect(getRoomInternalCodePrefix("custom")).toBe("ROOM")
	})

	it("normalizes explicit integration codes", () => {
		expect(normalizeRoomInternalCode(" dlx-01 ")).toBe("DLX-01")
		expect(normalizeRoomInternalCode(" ")).toBeNull()
	})
})
