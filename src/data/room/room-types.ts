export const ROOM_TYPES = [
	{
		id: "single",
		name: "Habitación Simple",
		maxOccupancy: 1,
		description: "Una cama individual; ideal para una persona.",
	},
	{
		id: "double",
		name: "Habitación Doble",
		maxOccupancy: 2,
		description: "Una cama doble o dos camas individuales; para dos personas.",
	},
	{
		id: "twin",
		name: "Habitación Twin",
		maxOccupancy: 2,
		description: "Dos camas individuales separadas; perfecta para amigos o compañeros de viaje.",
	},
	{
		id: "triple",
		name: "Habitación Triple",
		maxOccupancy: 3,
		description: "Tres camas individuales o una doble más una individual; para tres huéspedes.",
	},
	{
		id: "quad",
		name: "Habitación Cuádruple",
		maxOccupancy: 4,
		description: "Cuatro camas individuales o dos camas dobles; ideal para familias o grupos.",
	},
	{
		id: "queen",
		name: "Habitación Queen",
		maxOccupancy: 2,
		description: "Una cama tamaño Queen; para dos personas con mayor comodidad.",
	},
	{
		id: "king",
		name: "Habitación King",
		maxOccupancy: 2,
		description: "Una cama tamaño King; para dos personas, espaciosa y lujosa.",
	},
	{
		id: "suite",
		name: "Suite",
		maxOccupancy: 2,
		description:
			"Habitación amplia con zona de estar o sala; generalmente incluye servicios premium.",
	},
	{
		id: "junior_suite",
		name: "Junior Suite",
		maxOccupancy: 2,
		description:
			"Espacio semi-dividido con cama y área de estar; más grande que una habitación estándar.",
	},
	{
		id: "family_suite",
		name: "Suite Familiar",
		maxOccupancy: 4,
		description: "Diseñada para familias, con varias camas o dormitorios conectados.",
	},
	{
		id: "studio",
		name: "Estudio",
		maxOccupancy: 2,
		description: "Habitación con área de cocina o kitchenette integrada.",
	},
	{
		id: "apartment",
		name: "Departamento / Apartamento",
		maxOccupancy: 4,
		description: "Unidad independiente con cocina, sala y dormitorio; ideal para estancias largas.",
	},
	{
		id: "villa",
		name: "Villa",
		maxOccupancy: 4,
		description:
			"Alojamiento independiente con varias habitaciones y áreas privadas, a menudo con piscina.",
	},
	{
		id: "bungalow",
		name: "Bungalow",
		maxOccupancy: 3,
		description: "Unidad privada de un solo piso, usualmente rodeada de jardines o playa.",
	},
	{
		id: "penthouse",
		name: "Penthouse",
		maxOccupancy: 2,
		description: "Suite ubicada en el último piso con terraza o vistas panorámicas.",
	},
	{
		id: "duplex",
		name: "Dúplex",
		maxOccupancy: 4,
		description: "Habitación o suite de dos niveles conectados por una escalera interna.",
	},
	{
		id: "connecting",
		name: "Habitaciones Conectadas",
		maxOccupancy: 4,
		description: "Dos habitaciones unidas por una puerta interior; ideal para familias o grupos.",
	},
	{
		id: "accessible",
		name: "Habitación Accesible",
		maxOccupancy: 2,
		description:
			"Diseñada para huéspedes con movilidad reducida; acceso adaptado y baño accesible.",
	},
	{
		id: "deluxe",
		name: "Habitación Deluxe",
		maxOccupancy: 2,
		description: "Habitación superior con mejores vistas, mobiliario o ubicación dentro del hotel.",
	},
	{
		id: "executive",
		name: "Habitación Ejecutiva",
		maxOccupancy: 2,
		description:
			"Orientada a viajeros de negocios; incluye escritorio, sala o beneficios adicionales.",
	},
	{
		id: "presidential_suite",
		name: "Suite Presidencial",
		maxOccupancy: 2,
		description: "La suite más lujosa del hotel, con amplios espacios y servicios exclusivos.",
	},
	{
		id: "loft",
		name: "Loft",
		maxOccupancy: 2,
		description: "Espacio de planta abierta con techos altos; moderno y espacioso.",
	},
	{
		id: "cabana",
		name: "Cabaña / Cabana",
		maxOccupancy: 2,
		description: "Unidad junto a la piscina o playa, generalmente privada y con servicios propios.",
	},
	{
		id: "tent",
		name: "Tienda / Glamping",
		maxOccupancy: 2,
		description: "Alojamiento tipo tienda de lujo o glamping, combinando naturaleza y confort.",
	},
	{
		id: "dormitory",
		name: "Dormitorio Compartido",
		maxOccupancy: 1,
		description: "Cama en habitación compartida; usado en hostales y alojamientos económicos.",
	},
] as const

export type RoomType = (typeof ROOM_TYPES)[number]

export const ROOM_TYPE_MAP: Record<string, RoomType> = Object.fromEntries(
	ROOM_TYPES.map((r) => [r.id, r])
)
