import { BookingPolicySnapshotRepository } from "@/modules/booking/infrastructure/repositories/BookingPolicySnapshotRepository"
import { getPoliciesForBooking } from "@/modules/booking/application/use-cases/get-policies-for-booking"

const repo = new BookingPolicySnapshotRepository()

export async function getPoliciesForBookingUseCase(bookingId: string) {
	return getPoliciesForBooking({ repo }, bookingId)
}
