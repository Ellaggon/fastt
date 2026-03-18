export const POLICY_PRESETS = {
	// Cancellation: [
	// 	{
	// 		key: "free",
	// 		name: "Cancelación gratuita hasta",
	// 		description: "Cancelación gratuita hasta 24/48/72 horas antes del check-in.",
	// 	},
	// 	{
	// 		key: "free_48h",
	// 		name: "Cancelación gratuita hasta 48h",
	// 		description: "Cancelación gratuita hasta 48 horas antes del check-in.",
	// 	},
	// 	{
	// 		key: "free_72h",
	// 		name: "Cancelación gratuita hasta 72h",
	// 		description: "Cancelación gratuita hasta 72 horas antes del check-in.",
	// 	},
	// 	{
	// 		key: "non_refundable",
	// 		name: "No reembolsable",
	// 		description: "Esta tarifa no permite cancelaciones ni reembolsos.",
	// 	},
	// 	{
	// 		key: "partial_refund",
	// 		name: "Reembolso parcial",
	// 		description: "Las cancelaciones fuera del período gratuito pueden generar cargos parciales.",
	// 	},
	// 	{
	// 		key: "no_show",
	// 		name: "Cargo por no presentarse",
	// 		description: "En caso de no presentarse, se cobrará el importe total de la reserva.",
	// 	},
	// ],

	CheckIn: [
		{
			key: "checkin_14",
			name: "Check-in desde las",
			description: "El check-in está disponible a partir de las",
			ruleValue: {
				from: "15:00",
				until: "23:59",
			},
		},
		{
			key: "checkin_15",
			name: "Check-in desde las 15:00",
			description: "El check-in está disponible a partir de las 15:00.",
		},
		{
			key: "early_checkin_paid",
			name: "Check-in anticipado con cargo",
			description:
				"El check-in anticipado está sujeto a disponibilidad y puede tener un cargo adicional.",
		},
		{
			key: "early_checkin_free",
			name: "Check-in anticipado gratuito",
			description:
				"El check-in anticipado está sujeto a disponibilidad y no tiene costo adicional.",
		},
		{
			key: "no_late_checkin",
			name: "No se permite check-in fuera de horario",
			description: "No es posible realizar el check-in fuera del horario establecido.",
		},
	],

	CheckOut: [
		{
			key: "checkout_11",
			name: "Check-out hasta las 11:00",
			description: "El check-out debe realizarse antes de las 11:00.",
		},
		{
			key: "checkout_12",
			name: "Check-out hasta las 12:00",
			description: "El check-out debe realizarse antes de las 12:00.",
		},
		{
			key: "late_checkout_paid",
			name: "Check-out extendido con cargo",
			description:
				"El check-out extendido está sujeto a disponibilidad y puede tener un cargo adicional.",
		},
		{
			key: "late_checkout_free",
			name: "Check-out extendido gratuito",
			description:
				"El check-out extendido está sujeto a disponibilidad y no tiene costo adicional.",
		},
	],

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

	Payment: [
		{
			key: "credit_cards",
			name: "Tarjetas de crédito",
			description: "La propiedad acepta tarjetas de crédito.",
			ruleValue: {
				debitCards: true,
			},
		},
		{
			key: "debit_cards",
			name: "Tarjetas de débito",
			description: "La propiedad acepta tarjetas de débito.",
			ruleValue: {
				debitCards: true,
			},
		},
		{
			key: "cash_not_accepted",
			name: "No se acepta efectivo",
			description: "No se aceptan pagos en efectivo.",
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
}
