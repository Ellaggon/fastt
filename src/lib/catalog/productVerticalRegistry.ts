export type ProductTypeValue = "hotel" | "tour" | "package" | "limousine"
export type ProductTypeStorage = ProductTypeValue
export type ProductVertical = ProductTypeValue | "rental" | "generic"
export type VariantKindForVertical =
	| "hotel_room"
	| "tour_slot"
	| "package_base"
	| "limousine_service"

export type ProductVerticalSectionKey =
	| "identity"
	| "content"
	| "photos"
	| "location"
	| "subtype"
	| "rooms"
	| "houseRules"
	| "bookingPolicies"
	| "itinerary"
	| "services"
	| "inclusions"
	| "tickets"
	| "departure"
	| "rate"
	| "calendar"
	| "preview"

export type ProductVerticalSection = {
	key: ProductVerticalSectionKey
	label: string
	description: string
	required: boolean
	owner: "catalog" | "hospitality" | "contract" | "physical" | "experience"
}

export type ProductVerticalReadiness = {
	requiredSections: ProductVerticalSectionKey[]
	recommendedSections: ProductVerticalSectionKey[]
	publishSummary: string
}

export type ProductVerticalCreationCopy = {
	title: string
	heading: string
	description: string
	typeOptionLabel: string
	nameLabel: string
	namePlaceholder: string
	destinationLabel: string
	submitLabel: string
	loadingLabel: string
	successLabel: string
}

export type ProductVerticalRoutes = {
	workspaceListHref: string
	workspaceCreateHref: string
	workspaceFilteredHref: string
	publicCollectionHref: string | null
	publicSearchHref: string | null
	publicDetailHref: (productId: string) => string | null
}

export type ProductVerticalLabels = {
	singular: string
	plural: string
	detailTitle: string
	workspaceSingular: string
	workspacePlural: string
	publicSingular: string
	publicPlural: string
	variantSingular: string
	variantPlural: string
	ratePlanSingular: string
	ratePlanPlural: string
	scopeProduct: string
	scopeVariant: string
	scopeRatePlan: string
}

export type ProductVerticalRegistryEntry = {
	vertical: ProductVertical
	productType: ProductTypeValue | null
	variantKind: VariantKindForVertical | null
	status: "active" | "planned" | "fallback"
	labels: ProductVerticalLabels
	routes: ProductVerticalRoutes
	creation: ProductVerticalCreationCopy
	sections: ProductVerticalSection[]
	readiness: ProductVerticalReadiness
	contextLine: string
}

function encodeId(productId: string) {
	return encodeURIComponent(String(productId))
}

const commonCatalogSections: ProductVerticalSection[] = [
	{
		key: "identity",
		label: "Identidad",
		description: "Nombre, tipo y destino base de la oferta.",
		required: true,
		owner: "catalog",
	},
	{
		key: "content",
		label: "Contenido",
		description: "Descripcion y destacados visibles para el viajero.",
		required: true,
		owner: "catalog",
	},
	{
		key: "photos",
		label: "Fotos",
		description: "Galeria publica y foto principal.",
		required: true,
		owner: "catalog",
	},
	{
		key: "location",
		label: "Ubicacion",
		description: "Direccion o punto geografico publico.",
		required: true,
		owner: "catalog",
	},
	{
		key: "subtype",
		label: "Detalles",
		description: "Campos propios del tipo de oferta.",
		required: true,
		owner: "catalog",
	},
	{
		key: "bookingPolicies",
		label: "Condiciones de reserva",
		description: "Contrato que acepta el viajero antes de reservar.",
		required: true,
		owner: "contract",
	},
	{
		key: "preview",
		label: "Vista previa",
		description: "Revision final de lo que vera el viajero.",
		required: true,
		owner: "catalog",
	},
]

export const productVerticalRegistry = {
	hotel: {
		vertical: "hotel",
		productType: "hotel",
		variantKind: "hotel_room",
		status: "active",
		labels: {
			singular: "alojamiento",
			plural: "alojamientos",
			detailTitle: "Ficha del alojamiento",
			workspaceSingular: "Alojamiento",
			workspacePlural: "Alojamientos",
			publicSingular: "Hotel",
			publicPlural: "Hoteles",
			variantSingular: "habitacion",
			variantPlural: "habitaciones",
			ratePlanSingular: "plan tarifario",
			ratePlanPlural: "planes tarifarios",
			scopeProduct: "Alojamiento",
			scopeVariant: "Habitacion",
			scopeRatePlan: "Plan tarifario",
		},
		routes: {
			workspaceListHref: "/dashboard",
			workspaceCreateHref: "/product/create?playbook=launch&step=create&flow=create",
			workspaceFilteredHref: "/dashboard",
			publicCollectionHref: "/hotels",
			publicSearchHref: "/buscar/alojamientos",
			publicDetailHref: (productId: string) => `/hotels/${encodeId(productId)}`,
		},
		creation: {
			title: "Contenido del alojamiento · Crear alojamiento",
			heading: "Crear alojamiento",
			description:
				"Crea la identidad minima del alojamiento para empezar contenido, habitaciones y publicacion.",
			typeOptionLabel: "Alojamiento",
			nameLabel: "Nombre del alojamiento",
			namePlaceholder: "Ej: Hotel Central La Paz",
			destinationLabel: "Destino del alojamiento",
			submitLabel: "Crear alojamiento",
			loadingLabel: "Cargando: creando alojamiento...",
			successLabel: "Exito: alojamiento creado correctamente.",
		},
		sections: [
			...commonCatalogSections,
			{
				key: "rooms",
				label: "Habitaciones",
				description: "Unidades vendibles, capacidad y configuracion fisica.",
				required: true,
				owner: "physical",
			},
			{
				key: "houseRules",
				label: "Reglas para huespedes",
				description: "Comportamiento e instrucciones de estancia.",
				required: true,
				owner: "hospitality",
			},
		],
		readiness: {
			requiredSections: [
				"identity",
				"content",
				"photos",
				"location",
				"subtype",
				"rooms",
				"houseRules",
				"bookingPolicies",
				"preview",
			],
			recommendedSections: ["services"],
			publishSummary:
				"El alojamiento debe explicar espacio, fotos, ubicacion, habitaciones, condiciones y reglas de estancia.",
		},
		contextLine:
			"Prepara la ficha del alojamiento: contenido, fotos, ubicacion, habitaciones, reglas para huespedes y vista previa.",
	},
	tour: {
		vertical: "tour",
		productType: "tour",
		variantKind: "tour_slot",
		status: "active",
		labels: {
			singular: "tour",
			plural: "tours",
			detailTitle: "Ficha del tour",
			workspaceSingular: "Tour",
			workspacePlural: "Tours",
			publicSingular: "Tour",
			publicPlural: "Tours",
			variantSingular: "salida",
			variantPlural: "salidas",
			ratePlanSingular: "tarifa",
			ratePlanPlural: "tarifas",
			scopeProduct: "Tour",
			scopeVariant: "Salida",
			scopeRatePlan: "Tarifa",
		},
		routes: {
			workspaceListHref: "/catalog/tours",
			workspaceCreateHref: "/product/create?type=Tour&playbook=launch-tour&step=create&flow=create",
			workspaceFilteredHref: "/catalog/tours",
			publicCollectionHref: "/tours",
			publicSearchHref: "/buscar/tours",
			publicDetailHref: (productId: string) => `/tours/${encodeId(productId)}`,
		},
		creation: {
			title: "Catalogo · Crear tour",
			heading: "Crear tour",
			description:
				"Crea la identidad minima del tour para preparar descripcion, itinerario, punto de encuentro y publicacion.",
			typeOptionLabel: "Tour",
			nameLabel: "Nombre del tour",
			namePlaceholder: "Ej: City Tour Historico La Paz",
			destinationLabel: "Destino del tour",
			submitLabel: "Crear tour",
			loadingLabel: "Cargando: creando tour...",
			successLabel: "Exito: tour creado correctamente.",
		},
		sections: [
			...commonCatalogSections,
			{
				key: "itinerary",
				label: "Itinerario",
				description: "Secuencia de actividades y experiencia esperada.",
				required: true,
				owner: "experience",
			},
			{
				key: "services",
				label: "Servicios incluidos",
				description: "Transporte, guia, equipamiento u otros servicios visibles.",
				required: false,
				owner: "experience",
			},
		],
		readiness: {
			requiredSections: [
				"identity",
				"content",
				"photos",
				"location",
				"subtype",
				"itinerary",
				"tickets",
				"departure",
				"rate",
				"bookingPolicies",
				"calendar",
				"preview",
			],
			recommendedSections: ["services"],
			publishSummary:
				"El tour debe explicar actividad, itinerario, duracion, punto de encuentro, fotos, modalidades, precio y cupo.",
		},
		contextLine:
			"Prepara la ficha del tour: descripcion, fotos, punto de encuentro, itinerario, duracion, guia y vista previa.",
	},
	package: {
		vertical: "package",
		productType: "package",
		variantKind: "package_base",
		status: "active",
		labels: {
			singular: "paquete",
			plural: "paquetes",
			detailTitle: "Ficha del paquete",
			workspaceSingular: "Paquete",
			workspacePlural: "Paquetes",
			publicSingular: "Paquete",
			publicPlural: "Paquetes",
			variantSingular: "modalidad",
			variantPlural: "modalidades",
			ratePlanSingular: "tarifa",
			ratePlanPlural: "tarifas",
			scopeProduct: "Paquete",
			scopeVariant: "Modalidad",
			scopeRatePlan: "Tarifa",
		},
		routes: {
			workspaceListHref: "/catalog/packages",
			workspaceCreateHref: "/product/create?type=Package",
			workspaceFilteredHref: "/catalog/packages",
			publicCollectionHref: "/packages",
			publicSearchHref: "/packages",
			publicDetailHref: (productId: string) => `/packages/${encodeId(productId)}`,
		},
		creation: {
			title: "Catalogo · Crear paquete",
			heading: "Crear paquete",
			description:
				"Crea la identidad minima del paquete para preparar itinerario, inclusiones, fotos y publicacion.",
			typeOptionLabel: "Paquete",
			nameLabel: "Nombre del paquete",
			namePlaceholder: "Ej: La Paz y Lago Titicaca 4 dias",
			destinationLabel: "Destino principal del paquete",
			submitLabel: "Crear paquete",
			loadingLabel: "Cargando: creando paquete...",
			successLabel: "Exito: paquete creado correctamente.",
		},
		sections: [
			...commonCatalogSections,
			{
				key: "itinerary",
				label: "Itinerario",
				description: "Dias, noches y recorrido del paquete.",
				required: true,
				owner: "experience",
			},
			{
				key: "inclusions",
				label: "Incluye / no incluye",
				description: "Componentes incluidos, exclusiones y expectativas del viajero.",
				required: true,
				owner: "experience",
			},
		],
		readiness: {
			requiredSections: [
				"identity",
				"content",
				"photos",
				"location",
				"subtype",
				"itinerary",
				"inclusions",
				"bookingPolicies",
				"preview",
			],
			recommendedSections: ["services"],
			publishSummary:
				"El paquete debe explicar recorrido, dias/noches, inclusiones, fotos, punto geografico y condiciones.",
		},
		contextLine:
			"Prepara la ficha del paquete: recorrido, dias/noches, inclusiones, fotos, ubicacion y vista previa.",
	},
	limousine: {
		vertical: "limousine",
		productType: "limousine",
		variantKind: "limousine_service",
		status: "active",
		labels: {
			singular: "traslado",
			plural: "traslados",
			detailTitle: "Ficha del traslado",
			workspaceSingular: "Traslado",
			workspacePlural: "Traslados",
			publicSingular: "Traslado",
			publicPlural: "Traslados",
			variantSingular: "servicio",
			variantPlural: "servicios",
			ratePlanSingular: "tarifa",
			ratePlanPlural: "tarifas",
			scopeProduct: "Traslado",
			scopeVariant: "Servicio",
			scopeRatePlan: "Tarifa",
		},
		routes: {
			workspaceListHref: "/catalog/limousines",
			workspaceCreateHref: "/product/create?type=Limousine",
			workspaceFilteredHref: "/catalog/limousines",
			publicCollectionHref: "/limousines",
			publicSearchHref: "/limousines/search",
			publicDetailHref: (productId: string) => `/limousines/${encodeId(productId)}`,
		},
		creation: {
			title: "Catalogo · Crear traslado",
			heading: "Crear traslado",
			description:
				"Crea la identidad minima del servicio para preparar vehiculo, zonas, capacidad y publicacion.",
			typeOptionLabel: "Traslado",
			nameLabel: "Nombre del servicio",
			namePlaceholder: "Ej: Traslado ejecutivo aeropuerto",
			destinationLabel: "Destino o zona principal",
			submitLabel: "Crear traslado",
			loadingLabel: "Cargando: creando traslado...",
			successLabel: "Exito: traslado creado correctamente.",
		},
		sections: [
			...commonCatalogSections,
			{
				key: "services",
				label: "Vehiculo y servicio",
				description: "Capacidad, tipo de vehiculo, zonas de recogida y dropoff.",
				required: true,
				owner: "experience",
			},
		],
		readiness: {
			requiredSections: [
				"identity",
				"content",
				"photos",
				"location",
				"subtype",
				"services",
				"bookingPolicies",
				"preview",
			],
			recommendedSections: [],
			publishSummary:
				"El traslado debe explicar vehiculo, capacidad, zonas, fotos, disponibilidad y condiciones.",
		},
		contextLine:
			"Prepara la ficha del traslado: vehiculo, capacidad, zonas de recogida, dropoff, fotos y vista previa.",
	},
	rental: {
		vertical: "rental",
		productType: null,
		variantKind: null,
		status: "planned",
		labels: {
			singular: "propiedad",
			plural: "propiedades",
			detailTitle: "Ficha de la propiedad",
			workspaceSingular: "Propiedad",
			workspacePlural: "Propiedades",
			publicSingular: "Propiedad",
			publicPlural: "Propiedades",
			variantSingular: "unidad",
			variantPlural: "unidades",
			ratePlanSingular: "tarifa",
			ratePlanPlural: "tarifas",
			scopeProduct: "Propiedad",
			scopeVariant: "Unidad",
			scopeRatePlan: "Tarifa",
		},
		routes: {
			workspaceListHref: "/dashboard",
			workspaceCreateHref: "/product/create?type=Rental",
			workspaceFilteredHref: "/dashboard",
			publicCollectionHref: null,
			publicSearchHref: null,
			publicDetailHref: () => null,
		},
		creation: {
			title: "Catalogo · Crear propiedad",
			heading: "Crear propiedad",
			description: "Tipo planificado para alojamientos no hoteleros.",
			typeOptionLabel: "Propiedad",
			nameLabel: "Nombre de la propiedad",
			namePlaceholder: "Ej: Cabana vista al lago",
			destinationLabel: "Destino de la propiedad",
			submitLabel: "Crear propiedad",
			loadingLabel: "Cargando: creando propiedad...",
			successLabel: "Exito: propiedad creada correctamente.",
		},
		sections: commonCatalogSections,
		readiness: {
			requiredSections: ["identity", "content", "photos", "location", "bookingPolicies", "preview"],
			recommendedSections: ["houseRules"],
			publishSummary: "Vertical planificada; no debe aparecer como opcion activa todavia.",
		},
		contextLine:
			"Prepara la ficha de la propiedad: contenido, fotos, ubicacion, reglas de estancia y vista previa.",
	},
	generic: {
		vertical: "generic",
		productType: null,
		variantKind: null,
		status: "fallback",
		labels: {
			singular: "producto",
			plural: "productos",
			detailTitle: "Detalles de la oferta",
			workspaceSingular: "Producto",
			workspacePlural: "Productos",
			publicSingular: "Producto",
			publicPlural: "Productos",
			variantSingular: "variante",
			variantPlural: "variantes",
			ratePlanSingular: "rate plan",
			ratePlanPlural: "rate plans",
			scopeProduct: "Producto",
			scopeVariant: "Variante",
			scopeRatePlan: "Rate Plan",
		},
		routes: {
			workspaceListHref: "/dashboard",
			workspaceCreateHref: "/product/create",
			workspaceFilteredHref: "/dashboard",
			publicCollectionHref: null,
			publicSearchHref: null,
			publicDetailHref: () => null,
		},
		creation: {
			title: "Catalogo · Crear oferta",
			heading: "Crear oferta",
			description: "Crea la identidad minima para preparar contenido y publicacion.",
			typeOptionLabel: "Oferta",
			nameLabel: "Nombre",
			namePlaceholder: "Ej: Oferta principal",
			destinationLabel: "Destino",
			submitLabel: "Crear oferta",
			loadingLabel: "Cargando: creando oferta...",
			successLabel: "Exito: oferta creada correctamente.",
		},
		sections: commonCatalogSections,
		readiness: {
			requiredSections: ["identity", "content", "photos", "location", "subtype", "preview"],
			recommendedSections: ["bookingPolicies"],
			publishSummary: "Oferta generica pendiente de clasificacion vertical.",
		},
		contextLine:
			"Prepara una oferta de catalogo con contenido, fotos, ubicacion, detalles y vista previa.",
	},
} satisfies Record<ProductVertical, ProductVerticalRegistryEntry>

export const activeProductVerticals = ["hotel", "tour", "package", "limousine"] as const

const PRODUCT_TYPE_ALIASES: Record<string, ProductVertical> = {
	accommodation: "hotel",
	accommodations: "hotel",
	alojamiento: "hotel",
	alojamientos: "hotel",
	hotel: "hotel",
	hotels: "hotel",
	lodging: "hotel",
	package: "package",
	packages: "package",
	paquete: "package",
	paquetes: "package",
	tour: "tour",
	tours: "tour",
	experience: "tour",
	experiences: "tour",
	limo: "limousine",
	limos: "limousine",
	limousine: "limousine",
	limousines: "limousine",
	limusina: "limousine",
	limusinas: "limousine",
	rental: "rental",
	rentals: "rental",
	vacation_rental: "rental",
}

export function normalizeProductVertical(value: unknown): ProductVertical {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	return PRODUCT_TYPE_ALIASES[raw] ?? "generic"
}

export function getProductVerticalEntry(value: unknown): ProductVerticalRegistryEntry {
	return productVerticalRegistry[normalizeProductVertical(value)]
}

export function resolveProductVerticalEntry(values: unknown[]): ProductVerticalRegistryEntry {
	const verticals = [...new Set(values.map(normalizeProductVertical))]
	const concrete = verticals.filter((vertical) => vertical !== "generic")
	if (concrete.length === 1) return productVerticalRegistry[concrete[0]]
	return productVerticalRegistry.generic
}

export function listActiveProductVerticalEntries(): ProductVerticalRegistryEntry[] {
	return activeProductVerticals.map((vertical) => productVerticalRegistry[vertical])
}

export function getProductTypeFromVertical(vertical: ProductVertical): ProductTypeValue | null {
	return productVerticalRegistry[vertical].productType
}

export function normalizeProductTypeValue(value: unknown): ProductTypeValue | null {
	return getProductTypeFromVertical(normalizeProductVertical(value))
}

/** Canonical storage name for a persisted product type. */
export function normalizeProductTypeForStorage(value: unknown): ProductTypeStorage | null {
	return normalizeProductTypeValue(value)
}

/** Returns null for unsupported and non-persistable verticals. */
export function getProductVerticalDefinition(value: unknown): ProductVerticalRegistryEntry | null {
	const entry = productVerticalRegistry[normalizeProductVertical(value)]
	return entry.productType ? entry : null
}

export function isHotelProductType(value: unknown): boolean {
	return normalizeProductVertical(value) === "hotel"
}

export function isTourProductType(value: unknown): boolean {
	return normalizeProductVertical(value) === "tour"
}

export function productTypeLabel(value: unknown, fallback = "Oferta"): string {
	return getProductVerticalDefinition(value)?.labels.workspaceSingular ?? fallback
}

export function productTypePluralLabel(value: unknown, fallback = "Servicios"): string {
	return getProductVerticalDefinition(value)?.labels.workspacePlural ?? fallback
}

export function variantKindForProductType(value: unknown): VariantKindForVertical | null {
	return getProductVerticalDefinition(value)?.variantKind ?? null
}

/** Active, persistable verticals shown in provider catalog controls. */
export const PRODUCT_VERTICAL_OPTIONS = activeProductVerticals.map(
	(vertical) => productVerticalRegistry[vertical]
)
