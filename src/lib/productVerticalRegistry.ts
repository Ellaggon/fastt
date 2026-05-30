export type ProductVertical = "hotel" | "tour" | "package" | "limousine"
export type ProductTypeStorage = "Hotel" | "Tour" | "Package" | "Limousine"
export type VariantKindForVertical =
	| "hotel_room"
	| "tour_slot"
	| "package_base"
	| "limousine_service"

export type ProductVerticalDefinition = {
	vertical: ProductVertical
	storageType: ProductTypeStorage
	variantKind: VariantKindForVertical
	labels: {
		singular: string
		plural: string
		createCta: string
		detailTitle: string
	}
	publicRoutes: {
		index: string
		search: string
	}
	providerRoutes: {
		list: string
		create: string
	}
	requiredSections: string[]
	readinessSections: string[]
	createCopy: {
		title: string
		description: string
		namePlaceholder: string
	}
}

export const PRODUCT_VERTICALS: Record<ProductVertical, ProductVerticalDefinition> = {
	hotel: {
		vertical: "hotel",
		storageType: "Hotel",
		variantKind: "hotel_room",
		labels: {
			singular: "Alojamiento",
			plural: "Alojamientos",
			createCta: "Crear alojamiento",
			detailTitle: "Ficha del alojamiento",
		},
		publicRoutes: {
			index: "/hotels",
			search: "/hotels/search",
		},
		providerRoutes: {
			list: "/product?type=Hotel",
			create: "/product/create?type=Hotel",
		},
		requiredSections: ["contenido", "ubicacion", "fotos", "habitaciones", "reglas"],
		readinessSections: ["identidad", "contenido", "ubicacion", "fotos", "habitaciones"],
		createCopy: {
			title: "Crear alojamiento",
			description:
				"Crea la identidad mínima del alojamiento para empezar contenido, habitaciones y publicación.",
			namePlaceholder: "Ej: Hotel Boutique Centro",
		},
	},
	tour: {
		vertical: "tour",
		storageType: "Tour",
		variantKind: "tour_slot",
		labels: {
			singular: "Tour",
			plural: "Tours",
			createCta: "Crear tour",
			detailTitle: "Ficha del tour",
		},
		publicRoutes: {
			index: "/tours",
			search: "/tours/search",
		},
		providerRoutes: {
			list: "/product?type=Tour",
			create: "/product/create?type=Tour",
		},
		requiredSections: ["contenido", "ubicacion", "fotos", "itinerario"],
		readinessSections: ["identidad", "contenido", "punto de encuentro", "itinerario", "fotos"],
		createCopy: {
			title: "Crear tour",
			description:
				"Crea la identidad mínima del tour para empezar contenido, itinerario y publicación.",
			namePlaceholder: "Ej: Tour al Salar de Uyuni",
		},
	},
	package: {
		vertical: "package",
		storageType: "Package",
		variantKind: "package_base",
		labels: {
			singular: "Paquete",
			plural: "Paquetes",
			createCta: "Crear paquete",
			detailTitle: "Ficha del paquete",
		},
		publicRoutes: {
			index: "/packages",
			search: "/packages",
		},
		providerRoutes: {
			list: "/product?type=Package",
			create: "/product/create?type=Package",
		},
		requiredSections: ["contenido", "fotos", "itinerario", "incluye"],
		readinessSections: ["identidad", "contenido", "dias/noches", "itinerario", "incluye"],
		createCopy: {
			title: "Crear paquete",
			description:
				"Crea la identidad mínima del paquete para empezar itinerario, inclusiones y publicación.",
			namePlaceholder: "Ej: Paquete Andes 4 dias",
		},
	},
	limousine: {
		vertical: "limousine",
		storageType: "Limousine",
		variantKind: "limousine_service",
		labels: {
			singular: "Limusina",
			plural: "Limusinas",
			createCta: "Crear limusina",
			detailTitle: "Ficha de la limusina",
		},
		publicRoutes: {
			index: "/limousines",
			search: "/limousines/search",
		},
		providerRoutes: {
			list: "/product?type=Limousine",
			create: "/product/create?type=Limousine",
		},
		requiredSections: ["contenido", "ubicacion", "fotos", "vehiculo", "recogida"],
		readinessSections: [
			"identidad",
			"contenido",
			"vehiculo",
			"capacidad",
			"pickup/dropoff",
			"fotos",
		],
		createCopy: {
			title: "Crear limusina",
			description:
				"Crea la identidad mínima del servicio para definir vehículo, recogida, dropoff y capacidad.",
			namePlaceholder: "Ej: Limusina ejecutiva aeropuerto",
		},
	},
}

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
}

export function normalizeProductVertical(raw: unknown): ProductVertical | null {
	const key = String(raw ?? "")
		.trim()
		.toLowerCase()
	if (!key) return null
	return PRODUCT_TYPE_ALIASES[key] ?? null
}

export function getProductVerticalDefinition(raw: unknown): ProductVerticalDefinition | null {
	const vertical = normalizeProductVertical(raw)
	return vertical ? PRODUCT_VERTICALS[vertical] : null
}

export function normalizeProductTypeForStorage(raw: unknown): ProductTypeStorage | null {
	return getProductVerticalDefinition(raw)?.storageType ?? null
}

export function isHotelProductType(raw: unknown): boolean {
	return normalizeProductVertical(raw) === "hotel"
}

export function productTypeLabel(raw: unknown, fallback = "Oferta"): string {
	return getProductVerticalDefinition(raw)?.labels.singular ?? fallback
}

export function productTypePluralLabel(raw: unknown, fallback = "Ofertas"): string {
	return getProductVerticalDefinition(raw)?.labels.plural ?? fallback
}

export function variantKindForProductType(raw: unknown): VariantKindForVertical | null {
	return getProductVerticalDefinition(raw)?.variantKind ?? null
}

export const PRODUCT_VERTICAL_OPTIONS = Object.values(PRODUCT_VERTICALS)
