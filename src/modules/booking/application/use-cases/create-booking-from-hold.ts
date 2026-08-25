import type {
	BookingFromHoldRepositoryPort,
	CreateBookingFromHoldInput,
	CreateBookingFromHoldResult,
} from "@/modules/booking/application/ports/BookingFromHoldRepositoryPort"

export type { CreateBookingFromHoldInput, CreateBookingFromHoldResult }

export async function createBookingFromHold(
	deps: { repository: BookingFromHoldRepositoryPort },
	input: CreateBookingFromHoldInput
): Promise<CreateBookingFromHoldResult> {
	return deps.repository.createBookingFromHold(input)
}
