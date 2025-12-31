export class BookingError extends Error {
	status = 400
}

export class AvailabilityError extends BookingError {
	constructor() {
		super("Room no longer available")
	}
}

export class PriceMismatchError extends BookingError {
	constructor() {
		super("Price changed, please re-search")
	}
}

export class ValidationError extends BookingError {
	constructor(message: string) {
		super(message)
	}
}
