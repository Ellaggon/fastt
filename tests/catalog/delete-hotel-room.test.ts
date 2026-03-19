import { describe, it, expect, vi, beforeEach } from "vitest"

const HotelRoomType = { __t: "HotelRoomType", id: "id", hotelId: "hotelId" }

let mockRoom: any | null = { id: "room_1", hotelId: "hotel_1" }

vi.mock("astro:db", () => {
	const db = {
		select: vi.fn(() => ({
			from: vi.fn((_table: any) => ({
				where: vi.fn(() => ({
					get: vi.fn(async () => mockRoom),
				})),
			})),
		})),
	}
	return {
		db,
		eq: (..._args: any[]) => ({ __op: "eq" }),
		HotelRoomType,
	}
})

describe("catalog/deleteHotelRoom (unit)", () => {
	beforeEach(() => {
		vi.resetModules()
		mockRoom = { id: "room_1", hotelId: "hotel_1" }
	})

	it("returns 400 when params are missing", async () => {
		const { deleteHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/delete-hotel-room"
		)
		const resp = await deleteHotelRoom({
			hotelId: "",
			hotelRoomId: "",
			deleteCascade: vi.fn(async () => {}),
		})
		expect(resp.status).toBe(400)
		expect(await resp.json()).toEqual({ error: "Faltan parámetros obligatorios" })
	})

	it("returns 404 when room does not exist", async () => {
		mockRoom = null

		const { deleteHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/delete-hotel-room"
		)
		const resp = await deleteHotelRoom({
			hotelId: "hotel_1",
			hotelRoomId: "room_missing",
			deleteCascade: vi.fn(async () => {}),
		})
		expect(resp.status).toBe(404)
		expect(await resp.json()).toEqual({ error: "La habitación no existe" })
	})

	it("returns 403 when room does not belong to hotel", async () => {
		mockRoom = { id: "room_1", hotelId: "hotel_other" }

		const { deleteHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/delete-hotel-room"
		)
		const del = vi.fn(async () => {})
		const resp = await deleteHotelRoom({
			hotelId: "hotel_1",
			hotelRoomId: "room_1",
			deleteCascade: del,
		})
		expect(del).not.toHaveBeenCalled()
		expect(resp.status).toBe(403)
		expect(await resp.json()).toEqual({ error: "No autorizado" })
	})

	it("calls deleteCascade when authorized", async () => {
		const { deleteHotelRoom } = await import(
			"@/modules/catalog/application/use-cases/delete-hotel-room"
		)
		const del = vi.fn(async () => {})
		const resp = await deleteHotelRoom({
			hotelId: "hotel_1",
			hotelRoomId: "room_1",
			deleteCascade: del,
		})
		expect(del).toHaveBeenCalledTimes(1)
		expect(del).toHaveBeenCalledWith("room_1")
		expect(resp.status).toBe(200)
		expect(await resp.json()).toEqual({ success: true })
	})
})
