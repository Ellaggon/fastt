import { normalizeProductVertical, type ProductVertical } from "@/lib/productVerticalRegistry"

export type GeoPlaceType =
	| "country"
	| "admin_area_1"
	| "admin_area_2"
	| "city"
	| "locality"
	| "neighborhood"
	| "poi"
	| "natural_area"

const allowedPrimaryDiscoveryTypes: Record<ProductVertical, ReadonlySet<GeoPlaceType>> = {
	hotel: new Set(["city", "locality", "neighborhood", "poi"]),
	tour: new Set(["city", "locality", "neighborhood", "poi", "natural_area"]),
	package: new Set(["admin_area_1", "city", "locality", "natural_area"]),
	limousine: new Set(["admin_area_1", "city", "locality"]),
}

export function geoPlaceCompatibilityError(input: { productType: unknown; placeType: unknown }) {
	const vertical = normalizeProductVertical(input.productType)
	const placeType = String(input.placeType ?? "") as GeoPlaceType
	if (!vertical) return "El tipo de producto no admite una ubicación comercial."
	if (allowedPrimaryDiscoveryTypes[vertical].has(placeType)) return null
	return `Este tipo de ${vertical === "hotel" ? "alojamiento" : "producto"} requiere una ciudad, localidad o punto de venta compatible; no puede usar ${placeType || "este lugar"} como ubicación principal.`
}

export function isGeoPlaceCompatible(input: { productType: unknown; placeType: unknown }) {
	return geoPlaceCompatibilityError(input) === null
}
