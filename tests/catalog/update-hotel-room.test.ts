import { describe, it, expect, vi, beforeEach } from "vitest"

type InsertCall = { table: any; values: any }
type DeleteCall = { table: any }
type UpdateCall = { table: any; set: any }

// We mock astro:db so this unit test never touches the real DB.
const insertCalls: InsertCall[] = []
const deleteCalls: DeleteCall[] = []
const updateCalls: UpdateCall[] = []

const HotelRoomType = { __t: "HotelRoomType", id: "id" }
const Variant = { __t: "Variant", id: "id", entityId: "entityId" }
const HotelRoomAmenity = { __t: "HotelRoomAmenity" }
const Image = { __t: "Image", entityType: "entityType", entityId: "entityId" }

function makeDbMock(params: { variant: any | null }) {
	insertCalls.length = 0
	deleteCalls.length = 0
	updateCalls.length = 0

	const db = {
		update: vi.fn((table: any) => ({
			set: vi.fn((setObj: any) => {
				updateCalls.push({ table, set: setObj })
				return { where: vi.fn(async () => {}) }
			}),
		})),
		select: vi.fn(() => ({
			from: vi.fn((table: any) => ({
				where: vi.fn(() => ({
					get: vi.fn(async () => {
						if (table === Variant) return params.variant
						return null
					}),
				})),
			})),
		})),
		delete: vi.fn((table: any) => {
			deleteCalls.push({ table })
			return { where: vi.fn(async () => {}) }
		}),
		insert: vi.fn((table: any) => ({
			values: vi.fn(async (values: any) => {
				insertCalls.push({ table, values })
			}),
		})),
	}

	return db
}

vi.mock("astro:db", () => {
	const db = makeDbMock({ variant: { id: "var_1", basePrice: 50 } })
	return {
		db,
		eq: (..._args: any[]) => ({ __op: "eq" }),
		and: (..._args: any[]) => ({ __op: "and" }),
		HotelRoomType,
		Variant,
		HotelRoomAmenity,
		Image,
	}
})

describe("catalog/updateHotelRoom (unit)", () => {
	beforeEach(() => {
		// reset mocks between tests
		insertCalls.length = 0
		deleteCalls.length = 0
		updateCalls.length = 0
	})

	it("returns 400 when required IDs are missing", async () => {
		const { updateHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/update-hotel-room"
		)

		const fd = new FormData()
		fd.set("hotelId", "h1")
		// missing hotelRoomId + roomTypeId

		const resp = await updateHotelRoom(fd, { hotelId: "h1" })
		expect(resp.status).toBe(400)
		expect(await resp.json()).toEqual({ error: "Missing IDs" })
		expect(updateCalls.length).toBe(0)
	})

	it("updates room + variant, replaces amenities/images, and returns ok", async () => {
		const { updateHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/update-hotel-room"
		)

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

		const resp = await updateHotelRoom(fd, { hotelId: "hotel_1" })
		expect(resp.status).toBe(200)
		expect(await resp.json()).toEqual({ ok: true })

		// update HotelRoomType + Variant
		expect(updateCalls.some((c) => c.table === HotelRoomType)).toBe(true)
		expect(updateCalls.some((c) => c.table === Variant)).toBe(true)

		// delete amenities + images
		expect(deleteCalls.some((c) => c.table === HotelRoomAmenity)).toBe(true)
		expect(deleteCalls.some((c) => c.table === Image)).toBe(true)

		// insert amenities + images
		expect(insertCalls.some((c) => c.table === HotelRoomAmenity)).toBe(true)
		expect(insertCalls.some((c) => c.table === Image)).toBe(true)
	})
})
