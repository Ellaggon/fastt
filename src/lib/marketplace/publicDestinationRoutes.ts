import { BOLIVIA_MARKETPLACE_GEO_PLACES } from "@/data/geography/bolivia-marketplace-catalog"

export type PublicMarketplaceVertical = "alojamientos" | "tours"

const placesById = new Map(BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => [place.id, place]))

function pathForSeed(id: string): string | null {
	const parts: string[] = []
	let place = placesById.get(id)
	while (place) {
		parts.unshift(place.slug)
		place = place.parentId ? placesById.get(place.parentId) : undefined
	}
	return parts.length ? parts.join("/") : null
}

/**
 * Resolves an internal, canonical GeoPlace ID to its public route path.
 * It deliberately does not accept a short slug or display name: those values are
 * ambiguous and must first be resolved through GeoPlace search.
 */
export function publicGeoPlacePath(geoPlaceId: string): string {
	const path = pathForSeed(geoPlaceId)
	if (!path) throw new Error(`Unknown canonical GeoPlace: ${geoPlaceId}`)
	return path
}

export function publicDestinationHref(path: string, vertical: PublicMarketplaceVertical): string {
	const encodedPath = String(path)
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/")
	return `/destinos/${encodedPath}/${vertical}`
}

export function publicSearchHref(
	vertical: PublicMarketplaceVertical,
	search: URLSearchParams,
	canonicalPath?: string | null
): string {
	const params = new URLSearchParams(search)
	params.delete("geoPlaceId")
	params.delete("geoPlaceSlug")
	params.delete("destinationQuery")
	if (canonicalPath) params.set("destino", canonicalPath)
	const query = params.toString()
	return `/buscar/${vertical}${query ? `?${query}` : ""}`
}
