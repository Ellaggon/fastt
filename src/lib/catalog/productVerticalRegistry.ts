export type ProductVertical = "hotel" | "tour" | "package" | "rental" | "generic"

export type ProductTypeValue = "Hotel" | "Tour" | "Package"

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
	publicDetailHref: (productId: string) => string | null
}

export type ProductVerticalLabels = {
	singular: string
	plural: string
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
		productType: "Hotel",
		status: "active",
		labels: {
			singular: "alojamiento",
			plural: "alojamientos",
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
			workspaceListHref: "/product",
			workspaceCreateHref: "/product/create?type=Hotel",
			workspaceFilteredHref: "/product?type=Hotel",
			publicCollectionHref: "/hotels",
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
		productType: "Tour",
		status: "active",
		labels: {
			singular: "tour",
			plural: "tours",
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
			workspaceListHref: "/product",
			workspaceCreateHref: "/product/create?type=Tour",
			workspaceFilteredHref: "/product?type=Tour",
			publicCollectionHref: "/tours",
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
				"bookingPolicies",
				"preview",
			],
			recommendedSections: ["services"],
			publishSummary:
				"El tour debe explicar actividad, itinerario, duracion, punto de encuentro, fotos y condiciones.",
		},
		contextLine:
			"Prepara la ficha del tour: descripcion, fotos, punto de encuentro, itinerario, duracion, guia y vista previa.",
	},
	package: {
		vertical: "package",
		productType: "Package",
		status: "active",
		labels: {
			singular: "paquete",
			plural: "paquetes",
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
			workspaceListHref: "/product",
			workspaceCreateHref: "/product/create?type=Package",
			workspaceFilteredHref: "/product?type=Package",
			publicCollectionHref: "/packages",
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
	rental: {
		vertical: "rental",
		productType: null,
		status: "planned",
		labels: {
			singular: "propiedad",
			plural: "propiedades",
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
			workspaceListHref: "/product",
			workspaceCreateHref: "/product/create?type=Rental",
			workspaceFilteredHref: "/product?type=Rental",
			publicCollectionHref: null,
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
		status: "fallback",
		labels: {
			singular: "producto",
			plural: "productos",
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
			workspaceListHref: "/product",
			workspaceCreateHref: "/product/create",
			workspaceFilteredHref: "/product",
			publicCollectionHref: null,
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

export const activeProductVerticals = ["hotel", "tour", "package"] as const

export function normalizeProductVertical(value: unknown): ProductVertical {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	if (
		raw === "hotel" ||
		raw === "hotels" ||
		raw === "lodging" ||
		raw === "accommodation" ||
		raw === "accommodations" ||
		raw === "alojamiento" ||
		raw === "alojamientos"
	) {
		return "hotel"
	}
	if (raw === "tour" || raw === "tours" || raw === "experience" || raw === "experiences") {
		return "tour"
	}
	if (raw === "package" || raw === "packages" || raw === "paquete" || raw === "paquetes") {
		return "package"
	}
	if (raw === "rental" || raw === "rentals" || raw === "vacation_rental") return "rental"
	return "generic"
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
