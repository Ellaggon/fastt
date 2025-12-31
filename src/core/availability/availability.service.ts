import { db, HotelRoomType, BookingRoomDetail, Booking, BlackoutDate, RatePlan } from "astro:db"
import { eq, and, lte, gte } from "astro:db"
import { validateRatePlanWindow } from "./availability.validators"
import type { AvailabilityRequest, AvailabilityResult } from "./availability.types"

export async function checkAvailability(input: AvailabilityRequest): Promise<AvailabilityResult> {
	const checkIn = new Date(input.checkIn)
	const checkOut = new Date(input.checkOut)

	if (checkIn >= checkOut) return { available: false, reason: "Fechas inválidas" }

	// 1️⃣ RoomType
	const roomType = await db
		.select()
		.from(HotelRoomType)
		.where(eq(HotelRoomType.id, input.hotelRoomTypeId))
		.get()

	if (!roomType) return { available: false, reason: "Habitación no existe" }

	// 2️⃣ RatePlan
	const ratePlan = await db.select().from(RatePlan).where(eq(RatePlan.id, input.ratePlanId)).get()

	if (!ratePlan || !ratePlan.isActive) return { available: false, reason: "Tarifa inválida" }

	// 3️⃣ Validar reglas del rate plan
	const ruleError = validateRatePlanWindow({
		ratePlan,
		checkIn,
		checkOut,
	})

	if (ruleError) return { available: false, reason: ruleError }

	// 4️⃣ Blackout dates
	const blackout = await db
		.select()
		.from(BlackoutDate)
		.where(
			and(
				eq(BlackoutDate.hotelRoomTypeId, roomType.id),
				lte(BlackoutDate.startDate, checkOut),
				gte(BlackoutDate.endDate, checkIn)
			)
		)
		.get()

	if (blackout) return { available: false, reason: "Fecha bloqueada" }

	// 5️⃣ Reservas existentes
	const bookings = await db
		.select({
			quantity: BookingRoomDetail.quantity,
		})
		.from(BookingRoomDetail)
		.innerJoin(Booking, eq(BookingRoomDetail.bookingId, Booking.id))
		.where(
			and(
				eq(BookingRoomDetail.hotelRoomTypeId, roomType.id),
				lte(Booking.checkInDate, checkOut),
				gte(Booking.checkOutDate, checkIn),
				eq(Booking.status, "Confirmed")
			)
		)

	const booked = bookings.reduce((sum, b) => sum + b.quantity, 0)
	const availableRooms = roomType.totalRooms - booked

	if (availableRooms < input.quantity) return { available: false, reason: "Sin disponibilidad" }

	return { available: true }
}
