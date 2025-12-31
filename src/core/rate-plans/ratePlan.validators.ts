import { validateRatePlanWindow } from "@/core/availability/availability.validators"

export function isRatePlanValid({
	ratePlan,
	checkIn,
	checkOut,
}: {
	ratePlan: any
	checkIn: Date
	checkOut: Date
}): boolean {
	return ratePlan.isActive && !validateRatePlanWindow({ ratePlan, checkIn, checkOut })
}
