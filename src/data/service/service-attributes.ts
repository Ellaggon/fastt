export type ServiceAttributeDefinition = {
	key: string
	label: string
	type: "text" | "number" | "boolean" | "select"
	options?: { value: string; label: string }[]
	placeholder?: string
}

export const SERVICE_ATTRIBUTES: Record<string, ServiceAttributeDefinition[]> = {
	// ─── Internet ─────────────────────────────
	"wifi": [
		{ key: "speed", label: "Velocidad", type: "text", placeholder: "Ej: 300 Mbps" },
		{
			key: "coverage",
			label: "Cobertura",
			type: "select",
			options: [
				{ value: "room", label: "Habitaciones" },
				{ value: "common", label: "Áreas comunes" },
				{ value: "entire_property", label: "Todo el hotel" },
			],
		},
		{
			key: "type",
			label: "Tipo de conexión",
			type: "select",
			options: [
				{ value: "fiber", label: "Fibra óptica" },
				{ value: "dsl", label: "DSL" },
				{ value: "satellite", label: "Satelital" },
			],
		},
	],

	"paid-wifi": [
		{ key: "speed", label: "Velocidad", type: "text" },
		{
			key: "coverage",
			label: "Cobertura",
			type: "select",
			options: [
				{ value: "room", label: "Habitaciones" },
				{ value: "common", label: "Áreas comunes" },
				{ value: "entire_property", label: "Todo el hotel" },
			],
		},
	],

	"streaming": [
		{
			key: "platforms",
			label: "Plataformas disponibles",
			type: "text",
			placeholder: "Netflix, Prime Video, Disney+",
		},
	],

	// ─── Comidas & Bebidas ────────────────────
	"breakfast": [
		{
			key: "type",
			label: "Tipo de desayuno",
			type: "select",
			options: [
				{ value: "buffet", label: "Buffet" },
				{ value: "continental", label: "Continental" },
				{ value: "ala_carte", label: "A la carta" },
			],
		},
		{ key: "schedule", label: "Horario", type: "text", placeholder: "07:00 - 10:00" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	"restaurant": [
		{ key: "cuisine", label: "Tipo de cocina", type: "text", placeholder: "Italiana, local…" },
		{ key: "schedule", label: "Horario", type: "text" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	"bar": [{ key: "schedule", label: "Horario", type: "text" }],

	"minibar": [{ key: "restocked_daily", label: "Reposición diaria", type: "boolean" }],

	// ─── Piscinas & Wellness ──────────────────
	"pool": [
		{
			key: "type",
			label: "Tipo de piscina",
			type: "select",
			options: [
				{ value: "indoor", label: "Interior" },
				{ value: "outdoor", label: "Exterior" },
			],
		},
		{ key: "seasonal", label: "Piscina de temporada", type: "boolean" },
		{ key: "heated", label: "Piscina climatizada", type: "boolean" },
	],

	"indoor-pool": [{ key: "heated", label: "Piscina climatizada", type: "boolean" }],

	"outdoor-pool": [
		{ key: "seasonal", label: "Piscina de temporada", type: "boolean" },
		{ key: "heated", label: "Piscina climatizada", type: "boolean" },
	],

	"spa": [
		{
			key: "services",
			label: "Servicios disponibles",
			type: "text",
			placeholder: "Masajes, sauna, facial",
		},
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	"sauna": [
		{
			key: "type",
			label: "Tipo de sauna",
			type: "select",
			options: [
				{ value: "dry", label: "Seco" },
				{ value: "steam", label: "Vapor" },
			],
		},
	],

	"jacuzzi": [
		{
			key: "location",
			label: "Ubicación",
			type: "select",
			options: [
				{ value: "indoor", label: "Interior" },
				{ value: "outdoor", label: "Exterior" },
			],
		},
	],

	"gym": [{ key: "24h_access", label: "Acceso 24 horas", type: "boolean" }],

	// ─── Estacionamiento & Transporte ─────────
	"parking": [
		{ key: "covered", label: "Cubierto", type: "boolean" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
		{ key: "height_limit", label: "Altura máxima (m)", type: "number", placeholder: "2.1" },
	],

	"valet": [{ key: "reservation_required", label: "Requiere reserva", type: "boolean" }],

	"ev-charging": [
		{
			key: "charger_type",
			label: "Tipo de cargador",
			type: "select",
			options: [
				{ value: "type2", label: "Tipo 2" },
				{ value: "tesla", label: "Tesla" },
			],
		},
	],

	"shuttle": [
		{ key: "schedule", label: "Horario", type: "text" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	"airport-shuttle": [
		{ key: "schedule", label: "Horario", type: "text" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	"car-rental": [{ key: "provider", label: "Proveedor", type: "text" }],

	"bike-rental": [
		{
			key: "type",
			label: "Tipo de bicicleta",
			type: "select",
			options: [
				{ value: "electric", label: "Eléctrica" },
				{ value: "standard", label: "Convencional" },
			],
		},
	],

	"boat-tours": [
		{ key: "schedule", label: "Horario", type: "text" },
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
	],

	// ─── Servicios Generales ──────────────────
	"room-service": [{ key: "schedule", label: "Horario", type: "text" }],

	"24h-room-service": [],
	"laundry": [{ key: "same_day", label: "Servicio el mismo día", type: "boolean" }],
	"dryclean": [{ key: "same_day", label: "Servicio el mismo día", type: "boolean" }],
	"daily-cleaning": [],
	"24h-reception": [],
	"concierge": [],
	"business-center": [{ key: "24h_access", label: "Acceso 24 horas", type: "boolean" }],
	"meeting-rooms": [{ key: "capacity", label: "Capacidad", type: "number" }],
	"wedding": [{ key: "reservation_required", label: "Requiere reserva", type: "boolean" }],
	"luggage": [
		{ key: "after_checkout", label: "Disponible después del check-out", type: "boolean" },
	],

	// ─── Accesibilidad ────────────────────────
	"accessible": [
		{ key: "wheelchair_access", label: "Acceso para silla de ruedas", type: "boolean" },
	],
	"elevator": [],

	// ─── Familias & Mascotas ──────────────────
	"pet-friendly": [
		{ key: "max_weight", label: "Peso máximo (kg)", type: "number" },
		{
			key: "pet_type",
			label: "Tipo de mascota",
			type: "select",
			options: [
				{ value: "dog", label: "Perros" },
				{ value: "cat", label: "Gatos" },
				{ value: "both", label: "Ambos" },
			],
		},
	],

	"kids-club": [
		{ key: "age_range", label: "Rango de edad", type: "text", placeholder: "4–12 años" },
		{ key: "schedule", label: "Horario", type: "text" },
	],

	"babysitting": [{ key: "reservation_required", label: "Requiere reserva", type: "boolean" }],
	"highchair": [],

	// ─── Habitaciones ─────────────────────────
	"smoking-rooms": [],
	"nonsmoking": [],
	"fridge": [],
	"inroom-safe": [],
	"ironing": [],
	"wakeup": [],

	// ─── Negocios ─────────────────────────────
	"ATM": [],
	"currency-exchange": [],
	"business-services": [
		{
			key: "services",
			label: "Servicios disponibles",
			type: "text",
			placeholder: "Impresión, copias",
		},
	],

	// ─── Otros / Exteriores ───────────────────
	"tour-desk": [
		{
			key: "languages",
			label: "Idiomas disponibles",
			type: "text",
			placeholder: "Español, Inglés",
		},
	],

	"terrace": [],
	"rooftop": [{ key: "bar_available", label: "Bar disponible", type: "boolean" }],
	"fireplace": [],
	"evoucher": [
		{
			key: "type",
			label: "Tipo de voucher",
			type: "select",
			options: [
				{ value: "discount", label: "Descuento" },
				{ value: "package", label: "Paquete" },
			],
		},
	],
	"safety-railings": [],
}
