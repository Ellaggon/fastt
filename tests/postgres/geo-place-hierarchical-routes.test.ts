import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated =
	process.env.FASTT_DATA_ENV === "test"
		? prepareIsolatedTestDatabase()
		: { configured: false as const }
const connectionUrl = isolated.configured ? (isolated.directUrl ?? isolated.runtimeUrl) : ""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `geo-route-${randomUUID()}`

const ids = {
	country: `${prefix}-country`,
	north: `${prefix}-north`,
	south: `${prefix}-south`,
	cityNorth: `${prefix}-city-north`,
	citySouth: `${prefix}-city-south`,
}

describePostgres("GeoPlace hierarchical public routes", () => {
	let sql: postgres.Sql

	async function cleanup() {
		await sql`delete from "GeoPlace" where "id" like ${`${prefix}%`}`
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
		await cleanup()
	})

	afterAll(async () => {
		if (sql) {
			await cleanup()
			await sql.end()
		}
	})

	it("allows homonymous cities under different parents and propagates a parent route change", async () => {
		const aliases = await sql`
			select table_name
			from information_schema.tables
			where table_schema = current_schema() and table_name = 'GeoPlaceRouteAlias'
		`
		expect(aliases).toHaveLength(0)

		await sql`
			insert into "GeoPlace" ("id", "canonicalName", "normalizedName", "placeType", "countryCode", "slug")
			values (${ids.country}, 'Route Test Country', 'route test country', 'country', 'ZZ', 'route-test-country')
		`
		for (const [id, slug, name] of [
			[ids.north, "north", "North"],
			[ids.south, "south", "South"],
		] as const) {
			await sql`
				insert into "GeoPlace" ("id", "canonicalName", "normalizedName", "placeType", "countryCode", "parentId", "slug")
				values (${id}, ${name}, lower(${name}), 'admin_area_1', 'ZZ', ${ids.country}, ${slug})
			`
		}
		for (const [id, parentId] of [
			[ids.cityNorth, ids.north],
			[ids.citySouth, ids.south],
		] as const) {
			await sql`
				insert into "GeoPlace" ("id", "canonicalName", "normalizedName", "placeType", "countryCode", "parentId", "slug")
				values (${id}, 'La Paz', 'la paz', 'city', 'ZZ', ${parentId}, 'la-paz')
			`
		}

		const cities = await sql`
			select "id", "canonicalPath" from "GeoPlace"
			where "id" in (${ids.cityNorth}, ${ids.citySouth})
			order by "id"
		`
		expect(cities.map((city) => city.canonicalPath)).toEqual([
			"route-test-country/north/la-paz",
			"route-test-country/south/la-paz",
		])

		await sql`update "GeoPlace" set "slug" = 'north-renamed' where "id" = ${ids.north}`
		const [movedCity] = await sql`
			select "canonicalPath" from "GeoPlace" where "id" = ${ids.cityNorth}
		`
		expect(movedCity.canonicalPath).toBe("route-test-country/north-renamed/la-paz")
	})
})
