export const OPERATIONAL_RULE_PRESETS = {
	Availability: [
		{
			key: "stop_sell",
			name: "Stop Sell",
			description: "Bloquea la venta para el rango de fechas seleccionado.",
			explain: "La venta estará bloqueada durante este período",
			params: [],
		},
		{
			key: "open_sell",
			name: "Open Sell",
			description: "Habilita la venta para el rango de fechas seleccionado.",
			explain: "La venta estará habilitada durante este período",
			params: [],
		},
	],

	LengthOfStay: [
		{
			key: "min_los",
			name: "Mínimo de noches",
			description: "Define la cantidad mínima de noches para poder reservar.",
			explain: "La estadía mínima requerida es de {{minNights}} noches",
			params: [{ key: "minNights", type: "number", label: "Noches mínimas" }],
			defaultValues: { minNights: 2 },
		},
		{
			key: "max_los",
			name: "Máximo de noches",
			description: "Define la cantidad máxima de noches permitidas.",
			explain: "La estadía máxima permitida es de {{maxNights}} noches",
			params: [{ key: "maxNights", type: "number", label: "Noches máximas" }],
		},
	],

	ArrivalDeparture: [
		{
			key: "cta",
			name: "Closed to Arrival (CTA)",
			description: "No se permiten llegadas en las fechas seleccionadas.",
			explain: "No se permiten llegadas durante este período",
			params: [],
		},
		{
			key: "ctd",
			name: "Closed to Departure (CTD)",
			description: "No se permiten salidas en las fechas seleccionadas.",
			explain: "No se permiten salidas durante este período",
			params: [],
		},
	],

	BookingWindow: [
		{
			key: "min_lead_time",
			name: "Anticipación mínima",
			description: "El huésped debe reservar con cierta cantidad de días de anticipación.",
			explain: "La reserva debe realizarse con al menos {{days}} días de anticipación",
			params: [{ key: "days", type: "number", label: "Días de anticipación" }],
			defaultValues: { days: 1 },
		},
		{
			key: "max_lead_time",
			name: "Anticipación máxima",
			description: "No se permiten reservas más allá de cierta cantidad de días.",
			explain: "No se permiten reservas con más de {{days}} días de anticipación",
			params: [{ key: "days", type: "number", label: "Días máximos" }],
		},
	],

	Occupancy: [
		{
			key: "min_occupancy",
			name: "Ocupación mínima",
			description: "Define la cantidad mínima de personas para poder vender la habitación.",
			explain: "Se requiere un mínimo de {{guests}} personas",
			params: [{ key: "guests", type: "number", label: "Personas mínimas" }],
		},
		{
			key: "max_occupancy",
			name: "Ocupación máxima",
			description: "Define la cantidad máxima de personas permitidas.",
			explain: "El máximo permitido es de {{guests}} personas",
			params: [{ key: "guests", type: "number", label: "Personas máximas" }],
		},
	],

	Pricing: [
		{
			key: "price_multiplier",
			name: "Multiplicador de precio",
			description: "Aplica un multiplicador al precio base (ej: 1.2 = +20%).",
			explain: "El precio base se multiplica por {{factor}} durante este período",
			params: [{ key: "factor", type: "number", label: "Multiplicador", step: "0.01", min: "0" }],
			defaultValues: { factor: 1 },
		},
		{
			key: "price_offset",
			name: "Ajuste fijo de precio",
			description: "Suma o resta un valor fijo al precio base.",
			explain: "Se aplica un ajuste fijo de {{amount}} al precio",
			params: [{ key: "amount", type: "number", label: "Monto", step: "0.01", min: "0" }],
		},
	],

	Inventory: [
		{
			key: "limit_inventory",
			name: "Limitar inventario",
			description: "Define un máximo de habitaciones vendibles para el período.",
			explain: "La venta se limita a {{units}} unidades",
			params: [{ key: "units", type: "number", label: "Unidades" }],
		},
		{
			key: "allow_overbooking",
			name: "Permitir overbooking",
			description: "Permite vender más unidades que el inventario disponible.",
			explain: "Se permite sobreventa de hasta {{units}} unidades",
			params: [{ key: "units", type: "number", label: "Unidades extra" }],
		},
	],
} as const

export const SCOPE_EXPLANATIONS = {
	product: "Todo el alojamiento",
	room_type: "Habitación específica",
	rate_plan: "Plan tarifario específico",
} as const

export const INCOMPATIBLE_PRESETS = {
	stop_sell: ["open_sell"],
	open_sell: ["stop_sell"],

	min_los: ["max_los"],
	max_los: ["min_los"],

	cta: ["ctd"],
	ctd: ["cta"],
} as const
