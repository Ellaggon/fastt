import { ValidationError } from "./booking.errors"
import type { CreateBookingInput } from "./booking.types"

export function validateBookingInput(input: CreateBookingInput) {
	if (!input.productId) throw new ValidationError("Missing productId")
	if (!input.variantId) throw new ValidationError("Missing variantId")
	if (!input.ratePlanId) throw new ValidationError("Missing ratePlanId")

	if (!input.checkIn || !input.checkOut) {
		throw new ValidationError("Missing dates")
	}

	const nights =
		(new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / (1000 * 60 * 60 * 24)

	if (nights <= 0) {
		throw new ValidationError("Invalid date range")
	}

	if (input.adults <= 0) {
		throw new ValidationError("At least one adult required")
	}

	if (!["USD", "BOB"].includes(input.currency)) {
		throw new ValidationError("Invalid currency")
	}
}
