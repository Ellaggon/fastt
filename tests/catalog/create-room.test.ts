import { describe, it, expect, vi } from "vitest"
import { createRoom } from "@/modules/catalog/application/use-cases/create-room"

describe("catalog/createRoom (unit)", () => {
	it("returns 404 when hotel does not exist", async () => {
		const roomRepo = {
			hotelExistsByProductId: vi.fn(async () => false),
			createHotelRoom: vi.fn(async () => ({ hotelRoomId: "hr1", variantId: "v1" })),
		}
		const inventoryBootstrap = {
			bootstrapVariantInventory: vi.fn(async () => {}),
		}

		const res = await createRoom(
			{ roomRepo: roomRepo as any, inventoryBootstrap: inventoryBootstrap as any },
			{
				hotelId: "hotel_404",
				roomTypeId: "double",
				totalRooms: 2,
				hasView: null,
				bedTypes: [],
				hasBalcony: false,
				name: "Habitacion",
				description: null,
				currency: "USD",
				basePrice: 100,
				amenityIds: [],
				imageUrls: [],
			}
		)

		expect(res).toEqual({ ok: false, status: 404, error: "Hotel not found" })
		expect(roomRepo.createHotelRoom).not.toHaveBeenCalled()
		expect(inventoryBootstrap.bootstrapVariantInventory).not.toHaveBeenCalled()
	})

	it("creates room and bootstraps inventory (bedTypes empty => null)", async () => {
		const roomRepo = {
			hotelExistsByProductId: vi.fn(async () => true),
			createHotelRoom: vi.fn(async () => ({ hotelRoomId: "hr2", variantId: "v2" })),
		}
		const inventoryBootstrap = {
			bootstrapVariantInventory: vi.fn(async () => {}),
		}

		const res = await createRoom(
			{ roomRepo: roomRepo as any, inventoryBootstrap: inventoryBootstrap as any },
			{
				hotelId: "hotel_ok",
				roomTypeId: "double",
				totalRooms: 3,
				hasView: "sea",
				maxOccupancyOverride: 2,
				bedTypes: [],
				sizeM2: 20,
				hasBalcony: true,
				bathroom: 1,
				name: "Room Name",
				description: "Desc",
				currency: "USD",
				basePrice: 123,
				amenityIds: [],
				imageUrls: [],
			}
		)

		expect(roomRepo.createHotelRoom).toHaveBeenCalledTimes(1)
		expect(roomRepo.createHotelRoom).toHaveBeenCalledWith(
			expect.objectContaining({
				hotelId: "hotel_ok",
				roomTypeId: "double",
				totalRooms: 3,
				bedType: null,
				variant: expect.objectContaining({ basePrice: 123 }),
			})
		)

		expect(inventoryBootstrap.bootstrapVariantInventory).toHaveBeenCalledTimes(1)
		expect(inventoryBootstrap.bootstrapVariantInventory).toHaveBeenCalledWith({
			variantId: "v2",
			totalInventory: 3,
			days: 365,
		})

		expect(res).toEqual({ ok: true, hotelRoomId: "hr2", variantId: "v2" })
	})
})
