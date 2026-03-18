import type { RestrictionCategory } from "./restrictions-types"

export const CATEGORY_LABELS: Record<RestrictionCategory, string> = {
	Availability: "Disponibilidad",
	LengthOfStay: "Estancia mínima/máxima",
	ArrivalDeparture: "Llegada / Salida",
	BookingWindow: "Ventana de Reserva",
	Occupancy: "Ocupación",
	Pricing: "Precios",
	Inventory: "Inventario",
}
