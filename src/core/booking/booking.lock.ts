import { AvailabilityError } from "./booking.errors"

/**
 * Simulación de lock.
 * En producción: Redis / DB row lock / queue
 */
export async function lockInventory(key: string) {
	// Placeholder
	const locked = true

	if (!locked) {
		throw new AvailabilityError()
	}

	return {
		release: async () => {
			/* unlock */
		},
	}
}
