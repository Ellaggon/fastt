import { serviceIcons } from "./service-icons"
import type { ServiceDefinition } from "./service-types"

export const SERVICE_CATALOG: ServiceDefinition[] = [
	// ─── Internet & Tecnología ─────────────────────────────
	{
		id: "wifi",
		name: "Wi-Fi gratuito",
		category: "Internet",
		defaultFree: true,
		icon: serviceIcons.wifi,
	},
	{
		id: "paid-wifi",
		name: "Wi-Fi premium",
		category: "Internet",
		defaultFree: false,
		icon: serviceIcons["paid-wifi"],
	},
	{
		id: "streaming",
		name: "Apps / streaming",
		category: "Internet",
		icon: serviceIcons.streaming,
	},
	{
		id: "flat-tv",
		name: "TV de pantalla plana",
		category: "Internet",
		icon: serviceIcons["flat-tv"],
	},

	// ─── Comidas y bebidas ─────────────────────────────────
	{
		id: "coffee",
		name: "Café / té",
		category: "Comidas y bebidas",
		icon: serviceIcons.coffee,
	},
	{
		id: "breakfast",
		name: "Desayuno",
		category: "Comidas y bebidas",
		icon: serviceIcons.breakfast,
	},
	{
		id: "restaurant",
		name: "Restaurante",
		category: "Comidas y bebidas",
		icon: serviceIcons.restaurant,
	},
	{
		id: "bar",
		name: "Bar / Lounge",
		category: "Comidas y bebidas",
		icon: serviceIcons.bar,
	},
	{
		id: "minibar",
		name: "Minibar",
		category: "Comidas y bebidas",
		icon: serviceIcons.minibar,
	},
	{
		id: "kids-menu",
		name: "Menú infantil",
		category: "Comidas y bebidas",
		icon: serviceIcons["kids-menu"],
	},

	// ─── Instalaciones ─────────────────────────────────────
	{
		id: "pool",
		name: "Piscina",
		category: "Instalaciones",
		icon: serviceIcons.pool,
	},
	{
		id: "indoor-pool",
		name: "Piscina cubierta",
		category: "Instalaciones",
		icon: serviceIcons["indoor-pool"],
	},
	{
		id: "outdoor-pool",
		name: "Piscina al aire libre",
		category: "Instalaciones",
		icon: serviceIcons["outdoor-pool"],
	},
	{
		id: "spa",
		name: "Spa / bienestar",
		category: "Instalaciones",
		icon: serviceIcons.spa,
	},
	{
		id: "sauna",
		name: "Sauna",
		category: "Instalaciones",
		icon: serviceIcons.sauna,
	},
	{
		id: "jacuzzi",
		name: "Jacuzzi / hidromasaje",
		category: "Instalaciones",
		icon: serviceIcons.jacuzzi,
	},
	{
		id: "gym",
		name: "Gimnasio",
		category: "Instalaciones",
		icon: serviceIcons.gym,
	},

	// ─── Estacionamiento y transporte ──────────────────────
	{
		id: "parking",
		name: "Estacionamiento",
		category: "Estacionamiento y transporte",
		icon: serviceIcons.parking,
	},
	{
		id: "valet",
		name: "Valet parking",
		category: "Estacionamiento y transporte",
		icon: serviceIcons.valet,
	},
	{
		id: "ev-charging",
		name: "Carga para vehículos eléctricos",
		category: "Estacionamiento y transporte",
		icon: serviceIcons["ev-charging"],
	},
	{
		id: "shuttle",
		name: "Servicio de transporte",
		category: "Estacionamiento y transporte",
		icon: serviceIcons.shuttle,
	},
	{
		id: "airport-shuttle",
		name: "Traslado al aeropuerto",
		category: "Estacionamiento y transporte",
		icon: serviceIcons["airport-shuttle"],
	},
	{
		id: "car-rental",
		name: "Alquiler de autos",
		category: "Estacionamiento y transporte",
		icon: serviceIcons["car-rental"],
	},
	{
		id: "bike-rental",
		name: "Alquiler de bicicletas",
		category: "Estacionamiento y transporte",
		icon: serviceIcons["bike-rental"],
	},
	{
		id: "boat-tours",
		name: "Excursiones náuticas",
		category: "Estacionamiento y transporte",
		icon: serviceIcons["boat-tours"],
	},

	// ─── Servicios generales ───────────────────────────────
	{
		id: "room-service",
		name: "Room service",
		category: "Servicios generales",
		icon: serviceIcons["room-service"],
	},
	{
		id: "24h-room-service",
		name: "Room service 24 h",
		category: "Servicios generales",
		icon: serviceIcons["24h-room-service"],
	},
	{
		id: "laundry",
		name: "Lavandería",
		category: "Servicios generales",
		icon: serviceIcons.laundry,
	},
	{
		id: "dryclean",
		name: "Tintorería",
		category: "Servicios generales",
		icon: serviceIcons.dryclean,
	},
	{
		id: "daily-cleaning",
		name: "Limpieza diaria",
		category: "Servicios generales",
		icon: serviceIcons["daily-cleaning"],
	},
	{
		id: "24h-reception",
		name: "Recepción 24 horas",
		category: "Servicios generales",
		icon: serviceIcons["24h-reception"],
	},
	{
		id: "concierge",
		name: "Concierge",
		category: "Servicios generales",
		icon: serviceIcons.concierge,
	},
	{
		id: "business-center",
		name: "Centro de negocios",
		category: "Servicios generales",
		icon: serviceIcons["business-center"],
	},
	{
		id: "meeting-rooms",
		name: "Salas de reuniones",
		category: "Servicios generales",
		icon: serviceIcons["meeting-rooms"],
	},
	{
		id: "wedding",
		name: "Eventos y bodas",
		category: "Servicios generales",
		icon: serviceIcons.wedding,
	},
	{
		id: "luggage",
		name: "Guardaequipaje",
		category: "Servicios generales",
		icon: serviceIcons.luggage,
	},

	// ─── Accesibilidad ─────────────────────────────────────
	{
		id: "accessible",
		name: "Accesible para personas con movilidad reducida",
		category: "Accesibilidad",
		icon: serviceIcons.accessible,
	},
	{
		id: "elevator",
		name: "Ascensor",
		category: "Accesibilidad",
		icon: serviceIcons.elevator,
	},

	// ─── Familias y mascotas ───────────────────────────────
	{
		id: "pet-friendly",
		name: "Acepta mascotas",
		category: "Mascotas",
		icon: serviceIcons["pet-friendly"],
	},
	{
		id: "kids-club",
		name: "Club infantil",
		category: "Familias",
		icon: serviceIcons["kids-club"],
	},
	{
		id: "babysitting",
		name: "Servicio de niñera",
		category: "Familias",
		icon: serviceIcons.babysitting,
	},
	{
		id: "highchair",
		name: "Sillas altas para bebés",
		category: "Familias",
		icon: serviceIcons.highchair,
	},

	// ─── Habitaciones ──────────────────────────────────────
	{
		id: "smoking-rooms",
		name: "Habitaciones para fumadores",
		category: "Habitación",
		icon: serviceIcons["smoking-rooms"],
	},
	{
		id: "nonsmoking",
		name: "Habitaciones no fumadores",
		category: "Habitación",
		icon: serviceIcons.nonsmoking,
	},
	{
		id: "fridge",
		name: "Frigorífico",
		category: "Habitación",
		icon: serviceIcons.fridge,
	},
	{
		id: "inroom-safe",
		name: "Caja fuerte en la habitación",
		category: "Habitación",
		icon: serviceIcons["inroom-safe"],
	},
	{
		id: "ironing",
		name: "Plancha",
		category: "Habitación",
		icon: serviceIcons.ironing,
	},
	{
		id: "wakeup",
		name: "Servicio despertador",
		category: "Habitación",
		icon: serviceIcons.wakeup,
	},

	// ─── Negocios y finanzas ───────────────────────────────
	{
		id: "ATM",
		name: "Cajero automático",
		category: "Negocios",
		icon: serviceIcons.ATM,
	},
	{
		id: "currency-exchange",
		name: "Cambio de divisas",
		category: "Negocios",
		icon: serviceIcons["currency-exchange"],
	},
	{
		id: "business-services",
		name: "Servicios empresariales",
		category: "Negocios",
		icon: serviceIcons["business-services"],
	},

	// ─── Otros / exteriores ────────────────────────────────
	{
		id: "tour-desk",
		name: "Venta de excursiones",
		category: "Otros",
		icon: serviceIcons["tour-desk"],
	},
	{
		id: "terrace",
		name: "Terraza",
		category: "Exteriores",
		icon: serviceIcons.terrace,
	},
	{
		id: "rooftop",
		name: "Rooftop",
		category: "Exteriores",
		icon: serviceIcons.rooftop,
	},
	{
		id: "fireplace",
		name: "Chimenea",
		category: "Otros",
		icon: serviceIcons.fireplace,
	},
	{
		id: "evoucher",
		name: "Ofertas y paquetes",
		category: "Otros",
		icon: serviceIcons.evoucher,
	},
	{
		id: "safety-railings",
		name: "Medidas de seguridad",
		category: "Otros",
		icon: serviceIcons["safety-railings"],
	},
]
