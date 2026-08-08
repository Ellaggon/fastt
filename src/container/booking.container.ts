import { BookingFromHoldRepository } from "@/modules/booking/infrastructure/repositories/BookingFromHoldRepository"
import { GuestTripQueryRepository } from "@/modules/booking/infrastructure/repositories/GuestTripQueryRepository"

export const bookingFromHoldRepository = new BookingFromHoldRepository()
export const guestTripQueryRepository = new GuestTripQueryRepository()
