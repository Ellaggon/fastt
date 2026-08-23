import { describe, expect, it } from "vitest"

import {
	resolveLegacyDestination,
	resolveProductGeoPlace,
	type GeoBackfillAlias,
	type GeoBackfillPlace,
} from "@/modules/catalog/public"

const places: GeoBackfillPlace[] = [
	{
		id: "geo:bo:la-paz-department",
		canonicalName: "La Paz",
		normalizedName: "la paz",
		countryCode: "BO",
		placeType: "admin_area_1",
		parentId: "geo:bo",
		centroidLat: -15.6333,
		centroidLng: -68.1333,
	},
	{
		id: "geo:bo:la-paz-city",
		canonicalName: "La Paz",
		normalizedName: "la paz",
		countryCode: "BO",
		placeType: "city",
		parentId: "geo:bo:la-paz-department",
		centroidLat: -16.5,
		centroidLng: -68.15,
	},
	{
		id: "geo:bo:cochabamba",
		canonicalName: "Cochabamba",
		normalizedName: "cochabamba",
		countryCode: "BO",
		placeType: "admin_area_1",
		parentId: "geo:bo",
		centroidLat: -17.5697,
		centroidLng: -65.7557,
	},
	{
		id: "geo:bo:cochabamba-city",
		canonicalName: "Cochabamba",
		normalizedName: "cochabamba",
		countryCode: "BO",
		placeType: "city",
		parentId: "geo:bo:cochabamba",
		centroidLat: -17.3895,
		centroidLng: -66.1568,
	},
]

const aliases: GeoBackfillAlias[] = [
	{ placeId: "geo:bo:la-paz-city", normalizedAlias: "nuestra senora de la paz" },
]

describe("geo backfill resolver", () => {
	it("automatically maps a legacy destination only when the location evidence is decisive", () => {
		const resolution = resolveLegacyDestination(
			{
				id: "legacy-la-paz",
				name: "Nuestra Señora de La Paz",
				country: "Bolivia",
				department: "La Paz",
				latitude: -16.5,
				longitude: -68.15,
			},
			places,
			aliases
		)

		expect(resolution).toMatchObject({
			placeId: "geo:bo:la-paz-city",
			resolutionStatus: "auto_matched",
			matchMethod: "name_coordinates",
			confidence: 100,
		})
	})

	it("keeps weak or unsupported legacy input out of automatic product coverage", () => {
		const resolution = resolveLegacyDestination(
			{
				id: "legacy-unknown",
				name: "La Paz",
				country: "Perú",
				department: null,
				latitude: null,
				longitude: null,
			},
			places,
			aliases
		)

		expect(resolution).toMatchObject({
			placeId: null,
			resolutionStatus: "unmatched",
			confidence: 0,
		})
	})

	it("uses a confirmed legacy equivalence before a direct coordinate heuristic", () => {
		const resolution = resolveProductGeoPlace({
			product: {
				id: "product-1",
				destinationId: "legacy-la-paz",
				country: "Bolivia",
				address: "Centro, La Paz",
				latitude: -16.49,
				longitude: -68.14,
			},
			legacyResolution: {
				placeId: "geo:bo:la-paz-city",
				resolutionStatus: "confirmed",
				matchMethod: "name_department",
				confidence: 95,
				distanceMeters: 100,
				evidence: {},
			},
			places,
			aliases,
			hasExistingPrimary: false,
		})

		expect(resolution).toMatchObject({
			placeId: "geo:bo:la-paz-city",
			resolutionStatus: "auto_matched",
			matchMethod: "legacy_destination",
		})
	})

	it("never overwrites a primary geography selected by an operator", () => {
		const resolution = resolveProductGeoPlace({
			product: {
				id: "product-1",
				destinationId: "legacy-la-paz",
				country: "BO",
				address: "La Paz",
				latitude: -16.5,
				longitude: -68.15,
			},
			legacyResolution: null,
			places,
			aliases,
			hasExistingPrimary: true,
		})

		expect(resolution).toMatchObject({ resolutionStatus: "superseded", placeId: null })
	})
})
