import { BOLIVIA_MARKETPLACE_GEO_PLACES } from "@/data/geography/bolivia-marketplace-catalog"
import { DEPARTMENTS } from "@/data/departments"

export type PublicMarketplaceVertical = "alojamientos" | "tours"

export function normalizePublicPlace(value: string | null | undefined): string {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es-BO")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

export function canonicalPublicPlaceSlug(value: string | null | undefined): string | null {
	const normalized = normalizePublicPlace(value)
	if (!normalized) return null

	const place =
		BOLIVIA_MARKETPLACE_GEO_PLACES.find(
			(candidate) => candidate.id === value || candidate.slug === normalized
		) ??
		BOLIVIA_MARKETPLACE_GEO_PLACES.find(
			(candidate) =>
				candidate.placeType === "city" &&
				(normalizePublicPlace(candidate.canonicalName) === normalized ||
					(candidate.aliases ?? []).some(
						(alias) => normalizePublicPlace(alias.value) === normalized
					))
		) ??
		BOLIVIA_MARKETPLACE_GEO_PLACES.find(
			(candidate) =>
				normalizePublicPlace(candidate.canonicalName) === normalized ||
				(candidate.aliases ?? []).some((alias) => normalizePublicPlace(alias.value) === normalized)
		)
	if (place) return place.slug

	return DEPARTMENTS.some((department) => department.id === normalized) ? normalized : null
}

/** Legacy department ids occasionally collide with a city slug (notably La Paz). */
export function canonicalPublicDepartmentSlug(value: string | null | undefined): string | null {
	const normalized = normalizePublicPlace(value)
	const department = DEPARTMENTS.find(
		(candidate) =>
			candidate.id === normalized || normalizePublicPlace(candidate.name) === normalized
	)
	if (!department) return null
	return (
		BOLIVIA_MARKETPLACE_GEO_PLACES.find(
			(candidate) =>
				candidate.placeType === "admin_area_1" &&
				normalizePublicPlace(candidate.canonicalName) === normalizePublicPlace(department.name)
		)?.slug ?? department.id
	)
}

export function publicDestinationHref(slug: string, vertical: PublicMarketplaceVertical): string {
	return `/destinos/${encodeURIComponent(slug)}/${vertical}`
}

export function publicSearchHref(
	vertical: PublicMarketplaceVertical,
	search: URLSearchParams
): string {
	const params = new URLSearchParams(search)
	const candidate =
		params.get("destino") ||
		params.get("destinationSlug") ||
		params.get("destinationQuery") ||
		params.get("destinationId")
	const canonicalSlug = canonicalPublicPlaceSlug(candidate)

	params.delete("destinationId")
	params.delete("destinationSlug")
	params.delete("destinationQuery")
	if (canonicalSlug) params.set("destino", canonicalSlug)
	const query = params.toString()
	return `/buscar/${vertical}${query ? `?${query}` : ""}`
}
