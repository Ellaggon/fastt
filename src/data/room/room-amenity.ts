/**
 * Amenities that can be truthfully promised for one specific room.
 * Property-wide facilities (pool, parking, restaurant, reception, etc.) belong
 * to the accommodation, not to this room profile.
 */
export const AMENITY_ROOMS = [
	{ id: "wifi", name: "Wi-Fi en la habitación", category: "Conectividad" },
	{ id: "workspace", name: "Espacio de trabajo", category: "Conectividad" },
	{ id: "desk", name: "Escritorio", category: "Conectividad" },
	{ id: "usb_outlets", name: "Enchufes USB junto a la cama", category: "Conectividad" },
	{ id: "telephone", name: "Teléfono", category: "Conectividad" },

	{ id: "air_conditioning", name: "Aire acondicionado", category: "Confort" },
	{ id: "heating", name: "Calefacción", category: "Confort" },
	{ id: "fan", name: "Ventilador", category: "Confort" },
	{ id: "soundproofing", name: "Insonorización", category: "Confort" },
	{ id: "blackout_curtains", name: "Cortinas opacas", category: "Confort" },
	{ id: "mosquito_net", name: "Mosquitero", category: "Confort" },

	{ id: "private_bathroom", name: "Baño privado", category: "Baño" },
	{ id: "shared_bathroom", name: "Baño compartido", category: "Baño" },
	{ id: "shower", name: "Ducha", category: "Baño" },
	{ id: "bathtub", name: "Bañera", category: "Baño" },
	{ id: "bidet", name: "Bidé", category: "Baño" },
	{ id: "hairdryer", name: "Secador de pelo", category: "Baño" },
	{ id: "towels", name: "Toallas", category: "Baño" },
	{ id: "toiletries", name: "Artículos de aseo", category: "Baño" },
	{ id: "bathrobe", name: "Bata de baño", category: "Baño" },

	{ id: "closet", name: "Armario o clóset", category: "Dormitorio" },
	{ id: "linens", name: "Ropa de cama", category: "Dormitorio" },
	{ id: "extra_pillows_blankets", name: "Almohadas y mantas adicionales", category: "Dormitorio" },
	{ id: "hangers", name: "Ganchos para ropa", category: "Dormitorio" },
	{ id: "iron", name: "Plancha para ropa", category: "Dormitorio" },
	{ id: "ironing_board", name: "Tabla de planchar", category: "Dormitorio" },
	{ id: "extra_long_beds", name: "Camas extra largas", category: "Dormitorio" },

	{ id: "tv", name: "Televisión", category: "Entretenimiento" },
	{ id: "smart_tv", name: "Smart TV", category: "Entretenimiento" },
	{ id: "cable_channels", name: "Canales por cable", category: "Entretenimiento" },
	{ id: "streaming_services", name: "Servicios de streaming", category: "Entretenimiento" },

	{ id: "kitchenette", name: "Cocina pequeña", category: "Cocina y comedor" },
	{ id: "full_kitchen", name: "Cocina completa", category: "Cocina y comedor" },
	{ id: "refrigerator", name: "Refrigerador", category: "Cocina y comedor" },
	{ id: "minibar", name: "Minibar", category: "Cocina y comedor" },
	{ id: "microwave", name: "Microondas", category: "Cocina y comedor" },
	{ id: "coffee_maker", name: "Cafetera", category: "Cocina y comedor" },
	{ id: "electric_kettle", name: "Hervidor eléctrico", category: "Cocina y comedor" },
	{ id: "dining_area", name: "Zona de comedor", category: "Cocina y comedor" },

	{ id: "safe", name: "Caja fuerte", category: "Seguridad" },
	{ id: "smoke_detector", name: "Detector de humo", category: "Seguridad" },
	{
		id: "carbon_monoxide_detector",
		name: "Detector de monóxido de carbono",
		category: "Seguridad",
	},
	{ id: "fire_extinguisher", name: "Extintor", category: "Seguridad" },
	{ id: "first_aid_kit", name: "Botiquín", category: "Seguridad" },

	{ id: "step_free_access", name: "Acceso sin escalones", category: "Accesibilidad" },
	{ id: "accessible_bathroom", name: "Baño accesible", category: "Accesibilidad" },
	{ id: "shower_grab_bar", name: "Barra de apoyo en la ducha", category: "Accesibilidad" },
	{ id: "toilet_grab_bar", name: "Barra de apoyo junto al inodoro", category: "Accesibilidad" },
	{ id: "shower_chair", name: "Silla para ducha", category: "Accesibilidad" },

	{ id: "crib", name: "Cuna disponible", category: "Familias" },
	{ id: "high_chair", name: "Silla alta para niños", category: "Familias" },
] as const

export type RoomAmenity = (typeof AMENITY_ROOMS)[number]
