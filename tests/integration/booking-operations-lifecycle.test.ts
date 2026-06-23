import { describe, expect, it } from "vitest"

import { deriveBookingLifecycle } from "@/modules/booking/public"

describe("booking operations lifecycle", () => {
	it("prioritizes persisted check-in over date-derived visibility", () => {
		const result = deriveBookingLifecycle({
			status: "confirmed",
			operationalStatus: "checked_in",
			checkIn: "2999-01-01",
			checkOut: "2999-01-02",
		})

		expect(result).toMatchObject({
			state: "in_house",
			basis: "stored_operation",
			reality: "persisted_operation",
		})
	})

	it("keeps checkout and no-show as distinct persisted operations", () => {
		expect(
			deriveBookingLifecycle({
				status: "confirmed",
				operationalStatus: "checked_out",
				checkIn: "2000-01-01",
				checkOut: "2000-01-02",
			}).state
		).toBe("checked_out")
		expect(
			deriveBookingLifecycle({
				status: "confirmed",
				operationalStatus: "no_show",
				checkIn: "2000-01-01",
				checkOut: "2000-01-02",
			}).state
		).toBe("no_show")
	})

	it("uses dates only as visibility when no operation was recorded", () => {
		const result = deriveBookingLifecycle({
			status: "confirmed",
			operationalStatus: "pending_arrival",
			checkIn: "2999-01-01",
			checkOut: "2999-01-02",
		})

		expect(result).toMatchObject({
			state: "upcoming_arrival",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		})
	})
})
