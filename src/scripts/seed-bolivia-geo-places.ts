import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	db,
	GeoPlace,
	GeoPlaceAlias,
	GeoPlaceClosure,
	GeoPlaceExternalId,
	inArray,
} from "@/shared/infrastructure/db/compat"
import {
	BOLIVIA_ADMINISTRATIVE_SOURCE,
	BOLIVIA_COORDINATE_SOURCE,
	BOLIVIA_MARKETPLACE_CATALOG_VERSION,
	BOLIVIA_MARKETPLACE_GEO_PLACES,
	type BoliviaGeoPlaceSeed,
} from "@/data/geography/bolivia-marketplace-catalog"

const SOURCE = "fastt_bolivia_catalog"
const SOURCE_REF = `${BOLIVIA_MARKETPLACE_CATALOG_VERSION}|${BOLIVIA_ADMINISTRATIVE_SOURCE.url}|${BOLIVIA_COORDINATE_SOURCE.url}`

function normalizeName(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es-BO")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function closureRows(places: readonly BoliviaGeoPlaceSeed[]) {
	const byId = new Map(places.map((place) => [place.id, place]))
	return places.flatMap((place) => {
		const rows = [{ ancestorId: place.id, descendantId: place.id, depth: 0 }]
		let ancestorId = place.parentId
		let depth = 1
		while (ancestorId) {
			const ancestor = byId.get(ancestorId)
			if (!ancestor) throw new Error(`BOLIVIA_GEO_PLACE_PARENT_MISSING:${place.id}:${ancestorId}`)
			rows.push({ ancestorId, descendantId: place.id, depth })
			ancestorId = ancestor.parentId
			depth += 1
		}
		return rows
	})
}

function aliasRows(places: readonly BoliviaGeoPlaceSeed[]) {
	return places.flatMap((place) => {
		const aliases = [
			{ value: place.canonicalName, type: "primary" as const },
			...(place.aliases ?? []).map((alias) => ({
				value: alias.value,
				type: alias.type ?? "alternate",
			})),
		]
		return aliases.map((alias) => {
			const normalizedAlias = normalizeName(alias.value)
			return {
				id: `geo:alias:${place.id}:${normalizedAlias.replace(/ /g, "-")}`,
				placeId: place.id,
				locale: "es-BO",
				alias: alias.value,
				normalizedAlias,
				aliasType: alias.type,
				isPreferred: alias.type === "primary",
			}
		})
	})
}

async function seed() {
	const now = new Date()
	const placeIds = BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => place.id)
	const places = BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => ({
		id: place.id,
		canonicalName: place.canonicalName,
		normalizedName: normalizeName(place.canonicalName),
		slug: place.slug,
		placeType: place.placeType,
		countryCode: "BO",
		parentId: place.parentId,
		mergedIntoId: null,
		centroidLat: place.latitude,
		centroidLng: place.longitude,
		boundingBoxJson: null,
		timezone: place.timezone,
		status: "active",
		source: SOURCE,
		sourceRef: SOURCE_REF,
		createdAt: now,
		updatedAt: now,
	}))

	for (const place of places) {
		await db
			.insert(GeoPlace)
			.values(place)
			.onConflictDoUpdate({
				target: GeoPlace.id,
				set: {
					canonicalName: place.canonicalName,
					normalizedName: place.normalizedName,
					slug: place.slug,
					placeType: place.placeType,
					countryCode: place.countryCode,
					parentId: place.parentId,
					mergedIntoId: place.mergedIntoId,
					centroidLat: place.centroidLat,
					centroidLng: place.centroidLng,
					boundingBoxJson: place.boundingBoxJson,
					timezone: place.timezone,
					status: place.status,
					source: place.source,
					sourceRef: place.sourceRef,
					updatedAt: now,
				},
			})
	}

	await db.delete(GeoPlaceClosure).where(inArray(GeoPlaceClosure.descendantId, placeIds))
	await db
		.insert(GeoPlaceClosure)
		.values(closureRows(BOLIVIA_MARKETPLACE_GEO_PLACES).map((row) => ({ ...row, createdAt: now })))

	for (const alias of aliasRows(BOLIVIA_MARKETPLACE_GEO_PLACES)) {
		await db
			.insert(GeoPlaceAlias)
			.values({ ...alias, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: [GeoPlaceAlias.placeId, GeoPlaceAlias.locale, GeoPlaceAlias.normalizedAlias],
				set: {
					alias: alias.alias,
					aliasType: alias.aliasType,
					isPreferred: alias.isPreferred,
					updatedAt: now,
				},
			})
	}

	await db
		.insert(GeoPlaceExternalId)
		.values({
			id: "geo:external:iso-3166-1:BO",
			placeId: "geo:bo",
			source: "iso_3166_1",
			externalId: "BO",
			externalUrl: "https://www.iso.org/obp/ui/#iso:code:3166:BO",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [GeoPlaceExternalId.source, GeoPlaceExternalId.externalId],
			set: { placeId: "geo:bo", updatedAt: now },
		})

	return {
		catalogVersion: BOLIVIA_MARKETPLACE_CATALOG_VERSION,
		places: places.length,
		departments: BOLIVIA_MARKETPLACE_GEO_PLACES.filter(
			(place) => place.placeType === "admin_area_1"
		).length,
		cities: BOLIVIA_MARKETPLACE_GEO_PLACES.filter((place) => place.placeType === "city").length,
		closures: closureRows(BOLIVIA_MARKETPLACE_GEO_PLACES).length,
		aliases: aliasRows(BOLIVIA_MARKETPLACE_GEO_PLACES).length,
	}
}

seed()
	.then((report) => {
		console.log(JSON.stringify({ action: "seeded_bolivia_geo_places", ...report }, null, 2))
	})
	.catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await closePostgresClients()
	})
