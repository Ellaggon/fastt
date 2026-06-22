export type CalendarControlMode = "price" | "availability" | "sellability" | "conditions"

export type CalendarControlAction = {
	id: string
	label: string
	professionalOnly?: boolean
	kind: "mutation" | "inspect" | "handoff"
}

export const CALENDAR_CONTROL_MODES: Array<{
	key: CalendarControlMode
	label: string
	helper: string
}> = [
	{ key: "price", label: "Precio", helper: "Precio final y ajustes." },
	{ key: "availability", label: "Disponibilidad", helper: "Cupos físicos." },
	{ key: "sellability", label: "Venta", helper: "Apertura y reglas." },
	{ key: "conditions", label: "Condiciones", helper: "Contrato de la tarifa." },
]

export const CALENDAR_CONTROL_ACTIONS: Record<CalendarControlMode, CalendarControlAction[]> = {
	price: [
		{ id: "manual_price", label: "Cambiar precio", kind: "mutation" },
		{ id: "price_comparison", label: "Mostrar base y final", kind: "inspect" },
		{
			id: "price_rules",
			label: "Crear regla de precio",
			kind: "handoff",
			professionalOnly: true,
		},
	],
	availability: [
		{ id: "inventory_units", label: "Cambiar cupo", kind: "mutation" },
		{ id: "inventory_detail", label: "Mostrar detalle físico", kind: "inspect" },
		{
			id: "availability_scale",
			label: "Operar varias tarifas",
			kind: "handoff",
			professionalOnly: true,
		},
	],
	sellability: [
		{ id: "stop_sell", label: "Cerrar venta", kind: "mutation" },
		{ id: "min_los", label: "Mínimo de noches", kind: "mutation" },
		{
			id: "sellability_rules",
			label: "Reglas avanzadas",
			kind: "handoff",
			professionalOnly: true,
		},
		{
			id: "applied_rules",
			label: "Reglas aplicadas",
			kind: "handoff",
			professionalOnly: true,
		},
	],
	conditions: [{ id: "conditions", label: "Ver condiciones", kind: "handoff" }],
}

export function visibleCalendarActions(mode: CalendarControlMode, professional: boolean) {
	return CALENDAR_CONTROL_ACTIONS[mode].filter((action) => professional || !action.professionalOnly)
}
