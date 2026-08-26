export type ProductTypeValue = "hotel" | "tour" | "package" | "limousine"

export type GeoPlaceType =
	| "country"
	| "admin_area_1"
	| "admin_area_2"
	| "city"
	| "locality"
	| "neighborhood"
	| "poi"
	| "natural_area"

const PRODUCT_TYPE_ALIASES: Record<string, ProductTypeValue> = {
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

function normalizeProductType(value: unknown): ProductTypeValue | null {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	return PRODUCT_TYPE_ALIASES[raw] ?? null
}

const allowedPrimaryDiscoveryTypes: Record<ProductTypeValue, ReadonlySet<GeoPlaceType>> = {
	hotel: new Set(["city", "locality", "neighborhood", "poi"]),
	tour: new Set(["city", "locality", "neighborhood", "poi", "natural_area"]),
	package: new Set(["admin_area_1", "city", "locality", "natural_area"]),
	limousine: new Set(["admin_area_1", "city", "locality"]),
}

export function geoPlaceCompatibilityError(input: { productType: unknown; placeType: unknown }) {
	const vertical = normalizeProductType(input.productType)
	const placeType = String(input.placeType ?? "") as GeoPlaceType
	if (!vertical) return "El tipo de producto no admite una ubicación comercial."
	if (allowedPrimaryDiscoveryTypes[vertical].has(placeType)) return null
	return `Este tipo de ${vertical === "hotel" ? "alojamiento" : "producto"} requiere una ciudad, localidad o punto de venta compatible; no puede usar ${placeType || "este lugar"} como ubicación principal.`
}

export function isGeoPlaceCompatible(input: { productType: unknown; placeType: unknown }) {
	return geoPlaceCompatibilityError(input) === null
}
