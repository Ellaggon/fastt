import { describe, it, expect, vi, beforeEach } from "vitest"
import type { HotelRoomQueryRepositoryPort } from "@/modules/catalog/public"

describe("catalog/updateHotelRoom (unit)", () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it("returns 400 when required IDs are missing", async () => {
		const { updateHotelRoom } = await import("@/modules/catalog/public")

		const repo: HotelRoomQueryRepositoryPort = {
			getHotelRoomById: vi.fn(async () => ({ id: "room_1", hotelId: "h1" })),
			getHotelRoomBundle: vi.fn(async () => null),
			updateHotelRoom: vi.fn(async () => {}),
		}

		const fd = new FormData()
		fd.set("hotelId", "h1")
		// missing hotelRoomId + roomTypeId

		const resp = await updateHotelRoom({ repo }, fd, { hotelId: "h1" })
		expect(resp.status).toBe(400)
		expect(await resp.json()).toEqual({ error: "Missing IDs" })
		expect(repo.updateHotelRoom).not.toHaveBeenCalled()
	})

	it("updates room + variant, replaces amenities/images, and returns ok", async () => {
		const { updateHotelRoom } = await import("@/modules/catalog/public")

		const repo: HotelRoomQueryRepositoryPort = {
			getHotelRoomById: vi.fn(async () => ({ id: "room_1", hotelId: "hotel_1" })),
			getHotelRoomBundle: vi.fn(async () => null),
			updateHotelRoom: vi.fn(async () => {}),
		}

		const fd = new FormData()
		fd.set("hotelId", "hotel_1")
		fd.set("hotelRoomId", "room_1")
		fd.set("roomTypeId", "double")
		fd.set("totalRooms", "3")
		fd.set("currency", "USD")
		fd.set("basePrice", "120")
		fd.set("name", "Suite")
		fd.set("description", "Nice")
		fd.set("bedTypes", JSON.stringify(["queen"]))
		fd.set("images", JSON.stringify(["https://example.com/x.jpg"]))
		fd.append("amenities", "amenity_1")
		fd.append("amenities", "amenity_2")
		fd.set("hasView", "sea")

		const resp = await updateHotelRoom({ repo }, fd, { hotelId: "hotel_1" })
		expect(resp.status).toBe(200)
		expect(await resp.json()).toEqual({ ok: true })

		expect(repo.updateHotelRoom).toHaveBeenCalledTimes(1)
		expect(repo.updateHotelRoom).toHaveBeenCalledWith(
			expect.objectContaining({
				hotelRoomId: "room_1",
				totalRooms: 3,
				variant: expect.objectContaining({ currency: "USD" }),
				amenityIds: ["amenity_1", "amenity_2"],
				imageUrls: ["https://example.com/x.jpg"],
			})
		)
	})
})
