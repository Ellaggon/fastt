import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import postgres from "postgres"
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	assertOperatingPlaces,
	readTerritoryAncestors,
	readHistoricalTerritoryMap,
} from "@/lib/tours/operating-geography"
import { allTerritoriesCovered } from "@/shared/domain/territorial-coverage"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
suite("operating geography persistence", () => {
	let sql: postgres.Sql
	const provider = randomUUID(),
		product = randomUUID()
	beforeAll(async () => {
		if (!isolated.configured) return
		sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 1, prepare: false })
		await sql`insert into "Provider" (id, "accountPurpose", "dataClassification") values (${provider}, 'internal_qa', 'fixture')`
		await sql`insert into "Product" (id, name, "productType", "providerId", "dataClass", "publicationState") values (${product}, 'Geography QA', 'tour', ${provider}, 'fixture', 'draft')`
	})
	afterAll(async () => {
		if (!sql) return
		await sql`delete from "TourComplianceContext" where "productId" = ${product}`
		await sql`delete from "Product" where id = ${product}`
		await sql`delete from "Provider" where id = ${provider}`
		await sql.end()
		await closePostgresClients()
	})
	it("resolves hierarchy in a batch and requires full coverage", async () => {
		const places = ["geo:bo:la-paz-city", "geo:bo:oruro-city"]
		const ancestors = await readTerritoryAncestors(places)
		expect(allTerritoriesCovered(places, ["geo:bo"], ancestors)).toBe(true)
		expect(allTerritoriesCovered(places, ["geo:bo:la-paz-department"], ancestors)).toBe(false)
		expect(
			allTerritoriesCovered(["geo:bo:la-paz-department"], ["geo:bo:la-paz-city"], ancestors)
		).toBe(false)
	})
	it("rejects nonexistent and foreign-country places", async () => {
		await expect(assertOperatingPlaces(["invented-place"])).rejects.toThrow(
			"invalid_tour_jurisdiction"
		)
		await expect(assertOperatingPlaces(["geo:bo"], "MX")).rejects.toThrow(
			"invalid_tour_jurisdiction"
		)
	})
	it("enforces references, unique selections and the singular projection in PostgreSQL", async () => {
		await expect(
			sql`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'missing', '["missing"]')`
		).rejects.toThrow("unknown_operating_territory")
		await expect(
			sql`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'geo:bo', '["geo:bo","geo:bo"]')`
		).rejects.toThrow("invalid_operating_territories")
		await expect(
			sql`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'geo:bo', '["geo:bo:oruro"]')`
		).rejects.toThrow("territory_projection_mismatch")
	})
	it("keeps all nine historical department correspondences without authorizing new markets", async () => {
		const map = await readHistoricalTerritoryMap()
		expect(Object.keys(map).filter((code) => code.startsWith("BO-"))).toHaveLength(9)
		expect(map["BO-LP"]).toBe("geo:bo:la-paz-department")
		expect(map["BO"]).toBe("geo:bo")
	})
	it("accepts more than nine canonical places without adding country-specific code", async () => {
		const rollback = new Error("qa_rollback")
		await expect(
			sql.begin(async (tx) => {
				const ids = Array.from({ length: 12 }, (_, i) => `qa-${provider}-${i}`)
				for (const [i, id] of ids.entries()) {
					await tx`insert into "GeoPlace" (id, "canonicalName", "normalizedName", slug, "canonicalPath", "placeType", "countryCode", "centroidLat", "centroidLng") values (${id}, ${`QA ${i}`}, ${`qa ${i}`}, ${id}, ${id}, 'admin_area_1', 'ZZ', 0, 0)`
				}
				await tx`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, ${ids[0]}, ${tx.json(ids)})`
				const [row] =
					await tx`select jsonb_array_length("jurisdictionCodes") as count from "TourComplianceContext" where "productId" = ${product}`
				expect(row.count).toBe(12)
				throw rollback
			})
		).rejects.toBe(rollback)
	})
	it("rejects policy references outside the policy country", async () => {
		const setId = randomUUID()
		await expect(
			sql.begin(async (tx) => {
				await tx`insert into "CompliancePolicySet" (id, key, label, country, vertical, "collectionModel") values (${setId}, ${setId}, 'QA only', 'MX', 'tour', 'property_collect')`
				await tx`insert into "CompliancePolicyVersion" (id, "policySetId", version, "effectiveFrom", "contextJson") values (${randomUUID()}, ${setId}, 1, now(), '{"jurisdictionCodes":["geo:bo"]}')`
			})
		).rejects.toThrow("invalid_policy_territory")
	})
	it("accepts mapped historical policy IDs only for the mapped country", async () => {
		const rollback = new Error("qa_rollback")
		const externalId = `qa-${provider}`
		await expect(
			sql.begin(async (tx) => {
				const setId = randomUUID()
				const versionId = randomUUID()
				await tx`insert into "GeoPlaceExternalId" (id, "placeId", source, "externalId") values (${randomUUID()}, 'geo:bo:la-paz-department', 'fastt_legacy_jurisdiction', ${externalId})`
				await tx`insert into "CompliancePolicySet" (id, key, label, country, vertical, "collectionModel") values (${setId}, ${setId}, 'QA historical alias', 'BO', 'tour', 'property_collect')`
				await tx`insert into "CompliancePolicyVersion" (id, "policySetId", version, "effectiveFrom", "contextJson") values (${versionId}, ${setId}, 1, now(), ${tx.json({ jurisdictionCodes: [externalId] })})`
				await tx`insert into "ComplianceRequirementRule" (id, "policyVersionId", domain, "requirementKey", "conditionJson") values (${randomUUID()}, ${versionId}, 'documents', 'territory', ${tx.json({ jurisdictionCodes: [externalId] })})`
				throw rollback
			})
		).rejects.toBe(rollback)

		const setId = randomUUID()
		await expect(
			sql.begin(async (tx) => {
				await tx`insert into "GeoPlaceExternalId" (id, "placeId", source, "externalId") values (${randomUUID()}, 'geo:bo:la-paz-department', 'fastt_legacy_jurisdiction', ${externalId})`
				await tx`insert into "CompliancePolicySet" (id, key, label, country, vertical, "collectionModel") values (${setId}, ${setId}, 'QA foreign alias', 'MX', 'tour', 'property_collect')`
				await tx`insert into "CompliancePolicyVersion" (id, "policySetId", version, "effectiveFrom", "contextJson") values (${randomUUID()}, ${setId}, 1, now(), ${tx.json({ jurisdictionCodes: [externalId] })})`
			})
		).rejects.toThrow("invalid_policy_territory")
	})
	it("migrates legacy declarations transactionally and rejects unknown codes", async () => {
		const source = await readFile("db/migrations/2026-10-29_operating_geography.sql", "utf8")
		const rolledBack = new Error("qa_rollback")
		await expect(
			sql.begin(async (tx) => {
				await tx.unsafe(
					'DROP TRIGGER "TourComplianceContext_geography_guard" ON "TourComplianceContext"'
				)
				await tx`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'BO-LP', '["BO-LP","BO-OR"]')`
				await tx.unsafe(source)
				const [row] =
					await tx`select "jurisdictionCodes" from "TourComplianceContext" where "productId" = ${product}`
				expect(row.jurisdictionCodes).toEqual(["geo:bo:la-paz-department", "geo:bo:oruro"])
				throw rolledBack
			})
		).rejects.toBe(rolledBack)
		await expect(
			sql.begin(async (tx) => {
				await tx.unsafe(
					'DROP TRIGGER "TourComplianceContext_geography_guard" ON "TourComplianceContext"'
				)
				await tx`insert into "TourComplianceContext" ("productId", "providerId", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'BO-UNKNOWN', '["BO-UNKNOWN"]')`
				await tx.unsafe(source)
			})
		).rejects.toThrow("unknown_operating_territory")
	})
})
