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

	Parties: [
		{
			key: "no_parties",
			name: "No parties or events",
			description: "Parties, events and large gatherings are not allowed at the property.",
		},
		{
			key: "events_on_request",
			name: "Events by prior approval",
			description: "Events require written approval from the property before arrival.",
		},
	],

	QuietHours: [
		{
			key: "quiet_hours_22_08",
			name: "Quiet hours from 22:00 to 08:00",
			description: "Guests must keep noise low between 22:00 and 08:00.",
		},
		{
			key: "respect_neighbors",
			name: "Respect neighbors",
			description: "Guests must avoid disruptive noise and respect neighboring units or homes.",
		},
	],

	Parking: [
		{
			key: "assigned_parking",
			name: "Assigned parking only",
			description: "Guests may park only in the assigned parking space or approved area.",
		},
		{
			key: "street_parking",
			name: "Street parking guidance",
			description: "Street parking is subject to local signs, hours and neighborhood rules.",
		},
	],

	CheckIn: [
		{
			key: "id_required",
			name: "ID required at check-in",
			description: "Guests must present a valid ID at check-in when requested by the property.",
		},
		{
			key: "arrival_instructions",
			name: "Arrival instructions required",
			description: "Guests must follow the arrival instructions shared before check-in.",
		},
	],

	Checkout: [
		{
			key: "return_keys",
			name: "Return keys or access devices",
			description: "Guests must return keys, cards or access devices before departure.",
		},
		{
			key: "basic_checkout",
			name: "Basic checkout expectations",
			description: "Guests should lock doors and leave the property in reasonable condition.",
		},
	],

	Safety: [
		{
			key: "shared_spaces",
			name: "Shared spaces guidance",
			description: "Guests must respect shared spaces and follow posted safety instructions.",
		},
		{
			key: "restricted_areas",
			name: "Restricted areas",
			description: "Guests must not enter staff-only, private or restricted areas.",
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
