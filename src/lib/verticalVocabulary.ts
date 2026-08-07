import { normalizeProductVertical } from "@/lib/productVerticalRegistry"

export type ProviderVertical = "hotel" | "tour" | "rental" | "package" | "limousine" | "generic"

/** Ops / booking / finance presentation copy (physical columns stay lodging-shaped). */
export type VerticalOpsVocabulary = {
	guest: string
	guestPlural: string
	lineItem: string
	lineItemPlural: string
	stayWindow: string
	upcomingState: string
	confirmArrivalAction: string
	inProgressState: string
	departureDueState: string
	registerDepartureAction: string
	checkedOutState: string
	noShowState: string
	metricArrivalsToday: string
	metricDeparturesToday: string
	metricInProgress: string
	metricArrivalsDetail: string
	metricDeparturesDetail: string
	metricInProgressDetail: string
	queueHint: string
	searchPlaceholder: string
	pageIntro: string
	financeGrossSourceLabel: string
}

export type VerticalVocabulary = {
	vertical: ProviderVertical
	product: string
	productPlural: string
	variant: string
	variantPlural: string
	ratePlan: string
	ratePlanPlural: string
	scopeProduct: string
	scopeVariant: string
	scopeRatePlan: string
	contextLine: string
	ops: VerticalOpsVocabulary
}

const VOCABULARY: Record<ProviderVertical, VerticalVocabulary> = {
	hotel: {
		vertical: "hotel",
		product: "alojamiento",
		productPlural: "alojamientos",
		variant: "habitacion",
		variantPlural: "habitaciones",
		ratePlan: "plan tarifario",
		ratePlanPlural: "planes tarifarios",
		scopeProduct: "Alojamiento",
		scopeVariant: "Habitacion",
		scopeRatePlan: "Plan tarifario",
		contextLine:
			"Gestiona reglas operativas de venta por alojamiento, habitacion o plan tarifario sin mezclar contenido de catalogo.",
		ops: {
			guest: "huésped",
			guestPlural: "huéspedes",
			lineItem: "habitación",
			lineItemPlural: "habitaciones",
			stayWindow: "Estancia",
			upcomingState: "Próxima llegada",
			confirmArrivalAction: "Confirmar llegada",
			inProgressState: "En estancia",
			departureDueState: "Salida hoy",
			registerDepartureAction: "Registrar salida",
			checkedOutState: "Salida registrada",
			noShowState: "No presentación",
			metricArrivalsToday: "Llegan hoy",
			metricDeparturesToday: "Salen hoy",
			metricInProgress: "En estancia",
			metricArrivalsDetail: "Check-ins esperados",
			metricDeparturesDetail: "Check-outs pendientes",
			metricInProgressDetail: "Huéspedes alojados",
			queueHint: "Cola operativa de recepción",
			searchPlaceholder: "Buscar huésped o reserva",
			pageIntro:
				"Gestiona llegadas, estadías, salidas, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva (BookingRoomDetail)",
		},
	},
	tour: {
		vertical: "tour",
		product: "tour",
		productPlural: "tours",
		variant: "salida",
		variantPlural: "salidas",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Tour",
		scopeVariant: "Salida",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por tour, salida o tarifa sin mezclar contenido de catalogo.",
		ops: {
			guest: "participante",
			guestPlural: "participantes",
			lineItem: "línea",
			lineItemPlural: "líneas",
			stayWindow: "Salida",
			upcomingState: "Próxima salida",
			confirmArrivalAction: "Registrar presentación",
			inProgressState: "En curso",
			departureDueState: "Salida del día",
			registerDepartureAction: "Cerrar actividad",
			checkedOutState: "Actividad cerrada",
			noShowState: "No presentación",
			metricArrivalsToday: "Salen hoy",
			metricDeparturesToday: "Cierre hoy",
			metricInProgress: "En curso",
			metricArrivalsDetail: "Tours con salida hoy",
			metricDeparturesDetail: "Actividades por cerrar",
			metricInProgressDetail: "Participantes presentados",
			queueHint: "Cola operativa de salidas",
			searchPlaceholder: "Buscar participante o reserva",
			pageIntro:
				"Gestiona salidas, presentaciones, vouchers, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva / BookingLineItem (tabla BookingRoomDetail)",
		},
	},
	rental: {
		vertical: "rental",
		product: "propiedad",
		productPlural: "propiedades",
		variant: "unidad",
		variantPlural: "unidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Propiedad",
		scopeVariant: "Unidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por propiedad, unidad o tarifa sin mezclar contenido de catalogo.",
		ops: {
			guest: "huésped",
			guestPlural: "huéspedes",
			lineItem: "unidad",
			lineItemPlural: "unidades",
			stayWindow: "Estancia",
			upcomingState: "Próxima llegada",
			confirmArrivalAction: "Confirmar llegada",
			inProgressState: "En estancia",
			departureDueState: "Salida hoy",
			registerDepartureAction: "Registrar salida",
			checkedOutState: "Salida registrada",
			noShowState: "No presentación",
			metricArrivalsToday: "Llegan hoy",
			metricDeparturesToday: "Salen hoy",
			metricInProgress: "En estancia",
			metricArrivalsDetail: "Check-ins esperados",
			metricDeparturesDetail: "Check-outs pendientes",
			metricInProgressDetail: "Huéspedes alojados",
			queueHint: "Cola operativa de propiedades",
			searchPlaceholder: "Buscar huésped o reserva",
			pageIntro:
				"Gestiona llegadas, estadías, salidas, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva (BookingRoomDetail)",
		},
	},
	package: {
		vertical: "package",
		product: "paquete",
		productPlural: "paquetes",
		variant: "modalidad",
		variantPlural: "modalidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Paquete",
		scopeVariant: "Modalidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por paquete, modalidad o tarifa sin mezclar contenido de catalogo.",
		ops: {
			guest: "viajero",
			guestPlural: "viajeros",
			lineItem: "línea",
			lineItemPlural: "líneas",
			stayWindow: "Viaje",
			upcomingState: "Próximo inicio",
			confirmArrivalAction: "Confirmar inicio",
			inProgressState: "En viaje",
			departureDueState: "Cierre hoy",
			registerDepartureAction: "Registrar cierre",
			checkedOutState: "Viaje cerrado",
			noShowState: "No presentación",
			metricArrivalsToday: "Inician hoy",
			metricDeparturesToday: "Cierran hoy",
			metricInProgress: "En viaje",
			metricArrivalsDetail: "Paquetes que inician",
			metricDeparturesDetail: "Paquetes por cerrar",
			metricInProgressDetail: "Viajeros en curso",
			queueHint: "Cola operativa de paquetes",
			searchPlaceholder: "Buscar viajero o reserva",
			pageIntro:
				"Gestiona inicios, viajes, cierres, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva (BookingRoomDetail)",
		},
	},
	limousine: {
		vertical: "limousine",
		product: "limusina",
		productPlural: "limusinas",
		variant: "servicio",
		variantPlural: "servicios",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Limusina",
		scopeVariant: "Servicio",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por limusina, servicio o tarifa sin mezclar contenido de catalogo.",
		ops: {
			guest: "pasajero",
			guestPlural: "pasajeros",
			lineItem: "servicio",
			lineItemPlural: "servicios",
			stayWindow: "Servicio",
			upcomingState: "Próximo servicio",
			confirmArrivalAction: "Confirmar inicio",
			inProgressState: "En servicio",
			departureDueState: "Cierre hoy",
			registerDepartureAction: "Cerrar servicio",
			checkedOutState: "Servicio cerrado",
			noShowState: "No presentación",
			metricArrivalsToday: "Hoy",
			metricDeparturesToday: "Cierre hoy",
			metricInProgress: "En servicio",
			metricArrivalsDetail: "Servicios programados",
			metricDeparturesDetail: "Servicios por cerrar",
			metricInProgressDetail: "Pasajeros en curso",
			queueHint: "Cola operativa de traslados",
			searchPlaceholder: "Buscar pasajero o reserva",
			pageIntro:
				"Gestiona servicios, presentaciones, cierres, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva (BookingRoomDetail)",
		},
	},
	generic: {
		vertical: "generic",
		product: "oferta",
		productPlural: "ofertas",
		variant: "unidad",
		variantPlural: "unidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Oferta",
		scopeVariant: "Unidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por oferta, unidad vendible o rate plan sin mezclar contenido de catalogo.",
		ops: {
			guest: "cliente",
			guestPlural: "clientes",
			lineItem: "línea",
			lineItemPlural: "líneas",
			stayWindow: "Reserva",
			upcomingState: "Próxima reserva",
			confirmArrivalAction: "Confirmar inicio",
			inProgressState: "En curso",
			departureDueState: "Cierre hoy",
			registerDepartureAction: "Registrar cierre",
			checkedOutState: "Cerrada",
			noShowState: "No presentación",
			metricArrivalsToday: "Hoy",
			metricDeparturesToday: "Cierre hoy",
			metricInProgress: "En curso",
			metricArrivalsDetail: "Reservas del día",
			metricDeparturesDetail: "Cierres pendientes",
			metricInProgressDetail: "Clientes en curso",
			queueHint: "Cola operativa de reservas",
			searchPlaceholder: "Buscar cliente o reserva",
			pageIntro:
				"Gestiona inicios, actividad, cierres, pagos y cancelaciones desde una sola cola de trabajo.",
			financeGrossSourceLabel: "Línea de reserva / BookingLineItem (tabla BookingRoomDetail)",
		},
	},
}

export function normalizeVertical(value: unknown): ProviderVertical {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	const productVertical = normalizeProductVertical(raw)
	if (productVertical) return productVertical
	if (raw === "rental" || raw === "rentals" || raw === "vacation_rental") return "rental"
	return "generic"
}

export function resolveVerticalVocabulary(productTypes: unknown[]): VerticalVocabulary {
	const verticals = [...new Set(productTypes.map(normalizeVertical))]
	const concrete = verticals.filter((vertical) => vertical !== "generic")
	if (concrete.length === 1) return VOCABULARY[concrete[0]]
	return VOCABULARY.generic
}

export function getVerticalVocabulary(vertical: ProviderVertical = "generic"): VerticalVocabulary {
	return VOCABULARY[vertical]
}

export function getVerticalOpsVocabulary(
	productTypeOrVertical: unknown = "generic"
): VerticalOpsVocabulary {
	return getVerticalVocabulary(normalizeVertical(productTypeOrVertical)).ops
}
