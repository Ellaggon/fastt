export type GeoBackfillPlace = {
	id: string
	canonicalName: string
	normalizedName: string
	countryCode: string
	placeType: string
	parentId: string | null
	centroidLat: number | null
	centroidLng: number | null
}

export type GeoBackfillAlias = {
	placeId: string
	normalizedAlias: string
}

export type LegacyDestinationCandidate = {
	id: string
	name: string
	country: string
	department: string | null
	latitude: number | null
	longitude: number | null
}

export type ProductGeoCandidate = {
	id: string
	destinationId: string
	country: string
	address: string | null
	latitude: number | null
	longitude: number | null
}

export type GeoBackfillResolution = {
	placeId: string | null
	resolutionStatus: "auto_matched" | "review_required" | "confirmed" | "unmatched" | "superseded"
	matchMethod:
		| "name_department"
		| "coordinates"
		| "name_coordinates"
		| "legacy_destination"
		| "address_coordinates"
		| "unmatched"
	confidence: number
	distanceMeters: number | null
	evidence: Record<string, unknown>
}

export function normalizeGeoName(value: string | null | undefined): string {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es-BO")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function countryCode(value: string): string | null {
	const normalized = normalizeGeoName(value)
	if (
		normalized === "bo" ||
		normalized === "bolivia" ||
		normalized === "estado plurinacional de bolivia"
	) {
		return "BO"
	}
	return null
}

export function distanceInMeters(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number }
): number {
	const radians = (value: number) => (value * Math.PI) / 180
	const earthRadius = 6_371_000
	const deltaLat = radians(to.latitude - from.latitude)
	const deltaLng = radians(to.longitude - from.longitude)
	const a =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLng / 2) ** 2
	return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function placeNames(place: GeoBackfillPlace, aliases: readonly GeoBackfillAlias[]) {
	return new Set([
		place.normalizedName,
		...aliases.filter((alias) => alias.placeId === place.id).map((alias) => alias.normalizedAlias),
	])
}

function rankDestinationCandidate(
	destination: LegacyDestinationCandidate,
	place: GeoBackfillPlace,
	aliases: readonly GeoBackfillAlias[],
	placesById: ReadonlyMap<string, GeoBackfillPlace>
) {
	const name = normalizeGeoName(destination.name)
	const department = normalizeGeoName(destination.department)
	const nameMatches = placeNames(place, aliases).has(name)
	const parent = place.parentId ? placesById.get(place.parentId) : null
	const departmentMatches = Boolean(
		department && parent && normalizeGeoName(parent.canonicalName) === department
	)
	const distanceMeters =
		destination.latitude != null &&
		destination.longitude != null &&
		place.centroidLat != null &&
		place.centroidLng != null
			? distanceInMeters(
					{ latitude: destination.latitude, longitude: destination.longitude },
					{ latitude: place.centroidLat, longitude: place.centroidLng }
				)
			: null

	let confidence = 0
	if (nameMatches) confidence += 70
	if (departmentMatches) confidence += 25
	if (distanceMeters != null) {
		if (distanceMeters <= 2_000) confidence += 30
		else if (distanceMeters <= 25_000) confidence += 20
		else if (distanceMeters <= 100_000) confidence += 10
	}

	const matchMethod: GeoBackfillResolution["matchMethod"] =
		nameMatches && distanceMeters != null
			? "name_coordinates"
			: nameMatches && departmentMatches
				? "name_department"
				: distanceMeters != null
					? "coordinates"
					: "unmatched"

	return {
		place,
		confidence: Math.min(confidence, 100),
		distanceMeters,
		nameMatches,
		departmentMatches,
		matchMethod,
	}
}

export function resolveLegacyDestination(
	destination: LegacyDestinationCandidate,
	places: readonly GeoBackfillPlace[],
	aliases: readonly GeoBackfillAlias[]
): GeoBackfillResolution {
	const expectedCountry = countryCode(destination.country)
	if (!expectedCountry) {
		return {
			placeId: null,
			resolutionStatus: "unmatched",
			matchMethod: "unmatched",
			confidence: 0,
			distanceMeters: null,
			evidence: { reason: "unsupported_country", legacyCountry: destination.country },
		}
	}

	const placesById = new Map(places.map((place) => [place.id, place]))
	const ranked = places
		.filter((place) => place.countryCode === expectedCountry && place.placeType === "city")
		.map((place) => rankDestinationCandidate(destination, place, aliases, placesById))
		.filter((candidate) => candidate.confidence > 0)
		.sort((left, right) => right.confidence - left.confidence)
	const top = ranked[0]
	const runnerUp = ranked[1]
	const ambiguous = Boolean(top && runnerUp && top.confidence - runnerUp.confidence < 10)

	if (!top) {
		return {
			placeId: null,
			resolutionStatus: "unmatched",
			matchMethod: "unmatched",
			confidence: 0,
			distanceMeters: null,
			evidence: { reason: "no_candidate", normalizedName: normalizeGeoName(destination.name) },
		}
	}

	const resolutionStatus = top.confidence >= 90 && !ambiguous ? "auto_matched" : "review_required"
	return {
		placeId: top.place.id,
		resolutionStatus,
		matchMethod: top.matchMethod,
		confidence: top.confidence,
		distanceMeters: top.distanceMeters,
		evidence: {
			normalizedName: normalizeGeoName(destination.name),
			normalizedDepartment: normalizeGeoName(destination.department),
			nameMatches: top.nameMatches,
			departmentMatches: top.departmentMatches,
			ambiguous,
			runnerUp: runnerUp ? { placeId: runnerUp.place.id, confidence: runnerUp.confidence } : null,
		},
	}
}

export function resolveProductGeoPlace(input: {
	product: ProductGeoCandidate
	legacyResolution: GeoBackfillResolution | null
	places: readonly GeoBackfillPlace[]
	aliases: readonly GeoBackfillAlias[]
	hasExistingPrimary: boolean
}): GeoBackfillResolution {
	if (input.hasExistingPrimary) {
		return {
			placeId: null,
			resolutionStatus: "superseded",
			matchMethod: "unmatched",
			confidence: 0,
			distanceMeters: null,
			evidence: { reason: "existing_primary_product_geo_place" },
		}
	}

	if (
		input.legacyResolution?.placeId &&
		["auto_matched", "confirmed"].includes(input.legacyResolution.resolutionStatus)
	) {
		return {
			placeId: input.legacyResolution.placeId,
			resolutionStatus: "auto_matched",
			matchMethod: "legacy_destination",
			confidence: Math.max(90, input.legacyResolution.confidence),
			distanceMeters: input.legacyResolution.distanceMeters,
			evidence: { inheritedFrom: "legacy_destination_map", ...input.legacyResolution.evidence },
		}
	}
	if (countryCode(input.product.country) !== "BO") {
		return {
			placeId: null,
			resolutionStatus: "unmatched",
			matchMethod: "unmatched",
			confidence: 0,
			distanceMeters: null,
			evidence: { reason: "unsupported_product_country", legacyCountry: input.product.country },
		}
	}

	const address = normalizeGeoName(input.product.address)
	const candidates = input.places
		.filter((place) => place.countryCode === "BO" && place.placeType === "city")
		.map((place) => {
			const distanceMeters =
				input.product.latitude != null &&
				input.product.longitude != null &&
				place.centroidLat != null &&
				place.centroidLng != null
					? distanceInMeters(
							{ latitude: input.product.latitude, longitude: input.product.longitude },
							{ latitude: place.centroidLat, longitude: place.centroidLng }
						)
					: null
			const addressMatches = [...placeNames(place, input.aliases)].some(
				(name) => name.length > 2 && address.includes(name)
			)
			let confidence = 0
			if (distanceMeters != null && distanceMeters <= 5_000) confidence += 90
			else if (distanceMeters != null && distanceMeters <= 25_000) confidence += 70
			if (addressMatches) confidence += distanceMeters != null ? 25 : 70
			return { place, distanceMeters, addressMatches, confidence: Math.min(confidence, 100) }
		})
		.filter((candidate) => candidate.confidence > 0)
		.sort((left, right) => right.confidence - left.confidence)
	const top = candidates[0]

	if (!top) {
		return {
			placeId: null,
			resolutionStatus: "unmatched",
			matchMethod: "unmatched",
			confidence: 0,
			distanceMeters: null,
			evidence: { reason: "no_product_coordinate_or_address_match" },
		}
	}

	const resolutionStatus = top.confidence >= 90 ? "auto_matched" : "review_required"
	return {
		placeId: top.place.id,
		resolutionStatus,
		matchMethod: top.addressMatches ? "address_coordinates" : "coordinates",
		confidence: top.confidence,
		distanceMeters: top.distanceMeters,
		evidence: { addressMatches: top.addressMatches },
	}
}
