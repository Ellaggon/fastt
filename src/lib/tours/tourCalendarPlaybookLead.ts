/**
 * Single instructional lead for the tour calendar playbook step.
 * Prefers the most specific availability cause; never stacks redundant empty-calendar messages.
 */
export function tourCalendarPlaybookLead(input: {
	bookingMode?: string | null
	futureDateCount?: number | null
	futureCapacityDateCount?: number | null
	availableDateCount?: number | null
}): string {
	const futureDateCount = Number(input.futureDateCount ?? 0)
	const futureCapacityDateCount = Number(input.futureCapacityDateCount ?? 0)
	const availableDateCount = Number(input.availableDateCount ?? 0)
	if (availableDateCount > 0) {
		return "Revisa o amplía las fechas con cupo de esta opción. Los viajeros reservan sobre esas salidas."
	}
	if (futureDateCount > 0 && futureCapacityDateCount === 0) {
		return "Las fechas futuras no tienen cupo habilitado. Abre cupos en el calendario."
	}
	if (futureDateCount > 0) {
		return "Todos los cupos de las fechas futuras están reservados. Abre más fechas o cupo."
	}
	if (input.bookingMode === "private") {
		return "Programa al menos una fecha de referencia para esta opción privada."
	}
	return "Abre al menos una fecha futura con cupo para participantes. Esa será la primera salida que podrán reservar los viajeros."
}
