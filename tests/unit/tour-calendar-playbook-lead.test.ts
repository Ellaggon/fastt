import { describe, expect, it } from "vitest"
import { tourCalendarPlaybookLead } from "@/lib/tours/tourCalendarPlaybookLead"

describe("tourCalendarPlaybookLead", () => {
	it("uses the shared instructional copy when no future dates exist", () => {
		expect(tourCalendarPlaybookLead({ futureDateCount: 0, availableDateCount: 0 })).toBe(
			"Abre al menos una fecha futura con cupo para participantes. Esa será la primera salida que podrán reservar los viajeros."
		)
	})

	it("uses the private-option copy when the booking mode is private", () => {
		expect(
			tourCalendarPlaybookLead({
				bookingMode: "private",
				futureDateCount: 0,
				availableDateCount: 0,
			})
		).toBe("Programa al menos una fecha de referencia para esta opción privada.")
	})

	it("asks to open capacity when future dates exist without inventory", () => {
		expect(
			tourCalendarPlaybookLead({
				futureDateCount: 3,
				futureCapacityDateCount: 0,
				availableDateCount: 0,
			})
		).toBe("Las fechas futuras no tienen cupo habilitado. Abre cupos en el calendario.")
	})

	it("reports sold-out future dates when capacity exists but nothing is sellable", () => {
		expect(
			tourCalendarPlaybookLead({
				futureDateCount: 3,
				futureCapacityDateCount: 2,
				availableDateCount: 0,
			})
		).toBe("Todos los cupos de las fechas futuras están reservados. Abre más fechas o cupo.")
	})

	it("guides review when sellable dates already exist", () => {
		expect(
			tourCalendarPlaybookLead({
				futureDateCount: 3,
				futureCapacityDateCount: 2,
				availableDateCount: 2,
			})
		).toBe(
			"Revisa o amplía las fechas con cupo de esta opción. Los viajeros reservan sobre esas salidas."
		)
	})
})
