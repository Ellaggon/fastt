export const HOUSE_RULE_PRESETS = {
	Children: [
		{
			key: "children_allowed",
			name: "Niños bienvenidos",
			description: "Se aceptan niños de todas las edades.",
		},
		{
			key: "no_children",
			name: "No se aceptan niños",
			description: "No se permiten niños en el alojamiento.",
		},
		{
			key: "free_children",
			name: "Niños sin cargo",
			description: "Los niños se hospedan sin cargo adicional utilizando las camas existentes.",
		},
		{
			key: "extra_bed",
			name: "Camas adicionales bajo solicitud",
			description:
				"Las camas adicionales están disponibles bajo solicitud y pueden tener un costo adicional.",
		},
		{
			key: "crib_available",
			name: "Cuna disponible",
			description: "Se ofrece cuna bajo solicitud, sujeta a disponibilidad.",
		},
	],

	Pets: [
		{
			key: "no_pets",
			name: "No se admiten mascotas",
			description: "No se permiten mascotas en el alojamiento.",
		},
		{
			key: "pets_allowed",
			name: "Mascotas permitidas",
			description: "Se admiten mascotas bajo petición y con posibles cargos adicionales.",
		},
		{
			key: "pets_free",
			name: "Mascotas sin cargo",
			description: "Se admiten mascotas sin costo adicional.",
		},
		{
			key: "service_animals",
			name: "Animales de servicio permitidos",
			description: "Se admiten animales de servicio sin costo adicional.",
		},
	],

	Smoking: [
		{
			key: "no_smoking",
			name: "No se permite fumar",
			description: "Está prohibido fumar en todas las áreas del alojamiento.",
		},
		{
			key: "smoking_areas",
			name: "Áreas designadas para fumar",
			description: "Está permitido fumar únicamente en las áreas designadas.",
		},
		{
			key: "smoking_rooms",
			name: "Habitaciones para fumadores",
			description: "El alojamiento cuenta con habitaciones designadas para fumadores.",
		},
	],

	ExtraBeds: [
		{
			key: "extra_bed_available",
			name: "Camas adicionales disponibles",
			description: "Se pueden solicitar camas adicionales con cargo.",
		},
		{
			key: "crib_on_request",
			name: "Cuna bajo solicitud",
			description: "Cunas disponibles bajo solicitud.",
		},
	],

	Access: [
		{
			key: "self_checkin",
			name: "Auto check-in",
			description: "Los huéspedes pueden acceder mediante auto check-in.",
		},
		{
			key: "key_pickup",
			name: "Retiro de llaves",
			description: "Las llaves se retiran en recepción o punto designado.",
		},
		{
			key: "smart_lock",
			name: "Cerradura inteligente",
			description: "Acceso mediante cerradura inteligente o código.",
		},
	],

	Other: [
		{
			key: "airport_transfer",
			name: "Traslado al aeropuerto disponible",
			description:
				"La propiedad ofrece servicio de traslado al aeropuerto, sujeto a cargos adicionales.",
		},
		{
			key: "front_desk_24h",
			name: "Recepción 24 horas",
			description: "La recepción está disponible las 24 horas.",
		},
		{
			key: "id_required",
			name: "Identificación requerida",
			description: "Se requiere identificación válida al momento del check-in.",
		},
		{
			key: "payment_methods",
			name: "Métodos de pago aceptados",
			description: "Se aceptan tarjetas de crédito y otros métodos de pago según disponibilidad.",
		},
	],
} as const
