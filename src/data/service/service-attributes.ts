export type ServiceAttributeDefinition = {
	key: string
	label: string
	type: "text" | "number" | "boolean" | "select" | "multiselect"
	options?: { value: string; label: string }[]
	placeholder?: string
}

export const COMMON: Record<string, ServiceAttributeDefinition> = {
	availability: {
		key: "availability",
		label: "Disponibilidad",
		type: "select",
		options: [
			{ value: "entire_property", label: "En todo el alojamiento" },
			{ value: "common_areas", label: "Solo en áreas comunes" },
			{ value: "room_only", label: "Solo en la habitación" },
		],
	},

	schedule: {
		key: "schedule",
		label: "Horario",
		type: "text",
		placeholder: "Ej: 07:00 – 22:00",
	},

	reservationRequired: {
		key: "reservation_required",
		label: "Requiere reserva",
		type: "boolean",
	},

	accessible: {
		key: "accessible",
		label: "Accesible para personas con movilidad reducida",
		type: "boolean",
	},

	ageRestriction: {
		key: "age_restriction",
		label: "Restricción de edad",
		type: "select",
		options: [
			{ value: "none", label: "Sin restricción" },
			{ value: "adults_only", label: "Solo adultos" },
			{ value: "children_allowed", label: "Niños permitidos" },
		],
	},
}

export const SERVICE_ATTRIBUTES: Record<string, ServiceAttributeDefinition[]> = {
	// ─── Internet ─────────────────────────────
	"wifi": [
		COMMON.availability,
		{
			key: "speed",
			label: "Velocidad",
			type: "text",
			placeholder: "Ej: 300 Mbps",
		},
		{
			key: "connection_type",
			label: "Tipo de conexión",
			type: "select",
			options: [
				{ value: "fiber", label: "Fibra óptica" },
				{ value: "dsl", label: "DSL" },
				{ value: "satellite", label: "Satelital" },
			],
		},
		{
			key: "quality",
			label: "Calidad de conexión",
			type: "select",
			options: [
				{ value: "basic", label: "Básica" },
				{ value: "good", label: "Buena" },
				{ value: "excellent", label: "Excelente" },
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
			key: "style",
			label: "Tipo de desayuno",
			type: "select",
			options: [
				{ value: "buffet", label: "Buffet" },
				{ value: "continental", label: "Continental" },
				{ value: "ala_carte", label: "A la carta" },
			],
		},
		{
			key: "service_style",
			label: "Forma de servicio",
			type: "select",
			options: [
				{ value: "self_service", label: "Autoservicio" },
				{ value: "served", label: "Servido en mesa" },
			],
		},
		COMMON.schedule,
		COMMON.reservationRequired,
	],

	"restaurant": [
		{ key: "cuisine", label: "Tipo de cocina", type: "text", placeholder: "Italiana, local…" },
		COMMON.schedule,
		COMMON.reservationRequired,
		{
			key: "dress_code",
			label: "Código de vestimenta",
			type: "select",
			options: [
				{ value: "casual", label: "Casual" },
				{ value: "smart_casual", label: "Smart casual" },
				{ value: "formal", label: "Formal" },
			],
		},
	],

	"bar": [
		COMMON.schedule,
		{
			key: "live_music",
			label: "Música en vivo",
			type: "boolean",
		},
	],

	"minibar": [{ key: "restocked_daily", label: "Reposición diaria", type: "boolean" }],

	// ─── Piscinas & Wellness ──────────────────
	"pool": [
		{
			key: "location",
			label: "Ubicación",
			type: "select",
			options: [
				{ value: "indoor", label: "Interior" },
				{ value: "outdoor", label: "Exterior" },
			],
		},
		{
			key: "heated",
			label: "Climatizada",
			type: "boolean",
		},
		{
			key: "seasonal",
			label: "Disponible por temporada",
			type: "boolean",
		},
		{
			key: "access",
			label: "Acceso",
			type: "select",
			options: [
				{ value: "guests_only", label: "Solo huéspedes" },
				{ value: "public", label: "Acceso público" },
			],
		},
		COMMON.ageRestriction,
	],

	"spa": [
		{
			key: "services",
			label: "Servicios disponibles",
			type: "text",
			placeholder: "Masajes, sauna, facial",
		},
		{ key: "reservation_required", label: "Requiere reserva", type: "boolean" },
		{
			key: "access_type",
			label: "Tipo de acceso",
			type: "select",
			options: [
				{ value: "free", label: "Incluido" },
				{ value: "paid", label: "Con costo adicional" },
			],
		},
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

	"gym": [
		{
			key: "24h_access",
			label: "Acceso 24 horas",
			type: "boolean",
		},
		{
			key: "equipment",
			label: "Equipamiento",
			type: "multiselect",
			options: [
				{ value: "cardio", label: "Cardio" },
				{ value: "weights", label: "Pesas" },
				{ value: "machines", label: "Máquinas" },
			],
		},
	],

	// ─── Estacionamiento & Transporte ─────────
	"parking": [
		{
			key: "location",
			label: "Ubicación",
			type: "select",
			options: [
				{ value: "onsite", label: "En el alojamiento" },
				{ value: "nearby", label: "Cercano" },
				{ value: "street", label: "En la calle" },
			],
		},
		{
			key: "covered",
			label: "Cubierto",
			type: "boolean",
		},
		COMMON.reservationRequired,
		{
			key: "height_limit",
			label: "Altura máxima (m)",
			type: "number",
		},
		{
			key: "access_type",
			label: "Tipo de acceso",
			type: "select",
			options: [
				{ value: "free", label: "Incluido" },
				{ value: "paid", label: "Con costo adicional" },
			],
		},
	],

	"airport-shuttle": [
		COMMON.schedule,
		COMMON.reservationRequired,
		{
			key: "transfer_type",
			label: "Tipo de traslado",
			type: "select",
			options: [
				{ value: "private", label: "Privado" },
				{ value: "shared", label: "Compartido" },
			],
		},
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
		{
			key: "wheelchair_access",
			label: "Acceso para silla de ruedas",
			type: "boolean",
		},
		{
			key: "accessible_rooms",
			label: "Habitaciones adaptadas",
			type: "boolean",
		},
	],
	"elevator": [],

	// ─── Familias & Mascotas ──────────────────
	"pet-friendly": [
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
		{
			key: "max_weight",
			label: "Peso máximo (kg)",
			type: "number",
		},
		{
			key: "restrictions",
			label: "Restricciones",
			type: "text",
			placeholder: "No razas peligrosas, máximo 2 mascotas…",
		},
		{
			key: "pets_policy",
			label: "Política de mascotas",
			type: "select",
			options: [
				{ value: "allowed", label: "Permitidas" },
				{ value: "on_request", label: "Bajo petición" },
				{ value: "not_allowed", label: "No permitidas" },
			],
		},
	],

	"kids-club": [
		{
			key: "age_range",
			label: "Rango de edad",
			type: "text",
			placeholder: "4–12 años",
		},
		COMMON.schedule,
		COMMON.reservationRequired,
	],

	"babysitting": [
		COMMON.reservationRequired,
		{
			key: "certified_staff",
			label: "Personal certificado",
			type: "boolean",
		},
	],
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
