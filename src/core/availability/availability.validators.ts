import { daysBetween, daysFromToday, getWeekday } from "@/core/date/date.utils"

export function validateRatePlanWindow({
	ratePlan,
	checkIn,
	checkOut,
}: {
	ratePlan: any
	checkIn: Date
	checkOut: Date
}) {
	const nights = daysBetween(checkIn, checkOut)
	if (nights < ratePlan.minNights) return "No cumple mínimo de noches"
	if (ratePlan.maxNights && nights > ratePlan.maxNights) return "Excede máximo de noches"

	const advance = daysFromToday(checkIn)
	if (advance < ratePlan.minAdvanceDays) return "No cumple venta anticipada mínima"
	if (ratePlan.maxAdvanceDays && advance > ratePlan.maxAdvanceDays)
		return "Excede venta anticipada máxima"

	if (ratePlan.startDate && checkIn < new Date(ratePlan.startDate)) return "Tarifa aún no válida"

	if (ratePlan.endDate) {
		const end = new Date(ratePlan.endDate)
		end.setDate(end.getDate() + 1)
		if (checkOut > end) return "Tarifa expirada"
	}

	if (ratePlan.validDays) {
		const validDays: number[] = ratePlan.validDays
		const day = getWeekday(checkIn)
		if (!validDays.includes(day)) return "Tarifa no válida para este día"
	}

	return null
}
