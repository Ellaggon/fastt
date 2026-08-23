import { describe, expect, it } from "vitest"

import {
	BOLIVIA_ADMINISTRATIVE_SOURCE,
	BOLIVIA_COORDINATE_SOURCE,
	BOLIVIA_MARKETPLACE_CATALOG_VERSION,
	BOLIVIA_MARKETPLACE_GEO_PLACES,
} from "@/data/geography/bolivia-marketplace-catalog"

describe("Bolivia marketplace geography catalog", () => {
	it("contains a controlled national hierarchy with all departments and capitals", () => {
		const departments = BOLIVIA_MARKETPLACE_GEO_PLACES.filter(
			(place) => place.placeType === "admin_area_1"
		)
		const cities = BOLIVIA_MARKETPLACE_GEO_PLACES.filter((place) => place.placeType === "city")
		const ids = new Set(BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => place.id))

		expect(BOLIVIA_MARKETPLACE_CATALOG_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/)
		expect(BOLIVIA_MARKETPLACE_GEO_PLACES).toHaveLength(30)
		expect(departments).toHaveLength(9)
		expect(cities).toHaveLength(20)
		expect(new Set(BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => place.id)).size).toBe(30)
		expect(new Set(BOLIVIA_MARKETPLACE_GEO_PLACES.map((place) => place.slug)).size).toBe(30)

		for (const place of BOLIVIA_MARKETPLACE_GEO_PLACES) {
			expect(place.latitude).toBeGreaterThanOrEqual(-23)
			expect(place.latitude).toBeLessThanOrEqual(-9)
			expect(place.longitude).toBeGreaterThanOrEqual(-70)
			expect(place.longitude).toBeLessThanOrEqual(-57)
			expect(place.timezone).toBe("America/La_Paz")
			if (place.parentId) expect(ids.has(place.parentId)).toBe(true)
		}

		for (const department of departments) {
			expect(cities.some((city) => city.parentId === department.id)).toBe(true)
		}

		const capitalsByDepartment = {
			"Beni": "Trinidad",
			"Chuquisaca": "Sucre",
			"Cochabamba": "Cochabamba",
			"La Paz": "La Paz",
			"Oruro": "Oruro",
			"Pando": "Cobija",
			"Potosí": "Potosí",
			"Santa Cruz": "Santa Cruz de la Sierra",
			"Tarija": "Tarija",
		}

		for (const [departmentName, capitalName] of Object.entries(capitalsByDepartment)) {
			const department = departments.find((place) => place.canonicalName === departmentName)
			expect(
				cities.some(
					(city) => city.parentId === department?.id && city.canonicalName === capitalName
				)
			).toBe(true)
		}
	})

	it("keeps provenance explicit for administrative names and WGS84 coordinates", () => {
		expect(BOLIVIA_ADMINISTRATIVE_SOURCE.url).toContain("ine.gob.bo")
		expect(BOLIVIA_COORDINATE_SOURCE.url).toContain("geonames.org")
		expect(BOLIVIA_COORDINATE_SOURCE.datum).toBe("WGS84")
	})
})
