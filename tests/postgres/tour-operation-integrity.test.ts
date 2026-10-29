import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as audit from "@/lib/provider-audit"
import { saveProviderHolderProfile } from "@/lib/provider-holder-profile"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { closePostgresClients } from "@/shared/infrastructure/db/client"
import { saveTourComplianceContext } from "@/lib/tours/tour-compliance-context"
import type { TourOperation } from "@/shared/domain/tour-operation"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
const provider = randomUUID(),
	otherProvider = randomUUID(),
	product = randomUUID(),
	user = randomUUID(),
	partner = randomUUID(),
	foreign = randomUUID()
const input = {
	operatingRole: "operator" as const,
	activityClasses: ["urban_cultural" as const],
	jurisdictionCode: "geo:bo:la-paz-department",
	jurisdictionCodes: ["geo:bo:la-paz-department"],
}
const operation: TourOperation = {
	version: 2,
	executionMode: "team",
	guidingService: false,
	characteristics: ["urban_cultural"],
	operatorResourceId: null,
	waterActivity: false,
	airActivity: false,
	foodHandling: "none",
	transportServices: [],
	resourceIds: [],
}

suite("tour operation transactional integrity", () => {
	let sql: postgres.Sql
	beforeAll(async () => {
		if (!isolated.configured) return
		sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 3, prepare: false })
		await sql`insert into "Provider" ("id", "accountPurpose", "dataClassification") values (${provider}, 'internal_qa', 'fixture'), (${otherProvider}, 'internal_qa', 'fixture')`
		await sql`insert into "User" ("id", "email") values (${user}, ${`${user}@fastt.test`})`
		await sql`insert into "ProviderUser" ("id", "providerId", "userId", "role") values (${randomUUID()}, ${provider}, ${user}, 'owner')`
		await sql`insert into "Product" ("id", "name", "productType", "providerId", "dataClass", "publicationState") values (${product}, 'Operation QA', 'tour', ${provider}, 'fixture', 'draft')`
		await sql`insert into "TourOperationalResource" ("id", "providerId", "type", "name", "declarationJson") values (${partner}, ${provider}, 'service_operator', 'External executor', '{"country":"BO","registrationId":null}'), (${foreign}, ${otherProvider}, 'guide', 'Foreign guide', null)`
	})
	beforeEach(async () => {
		await sql`delete from "ProviderHolderProfile" where "providerId" = ${provider}`
		await sql`update "ProviderUser" set "role" = 'owner' where "providerId" = ${provider} and "userId" = ${user}`
		await sql`delete from "TourComplianceContext" where "productId" = ${product}`
		await sql`delete from "ProviderAuditLog" where "providerId" in (${provider}, ${otherProvider})`
	})
	afterAll(async () => {
		if (!sql) return
		await sql`delete from "TourComplianceContext" where "productId" = ${product}`
		await sql`delete from "ProviderAuditLog" where "providerId" in (${provider}, ${otherProvider})`
		await sql`delete from "TourOperationalResource" where "id" in (${partner}, ${foreign})`
		await sql`delete from "Product" where "id" = ${product}`
		await sql`delete from "ProviderHolderProfile" where "providerId" = ${provider}`
		await sql`delete from "ProviderUser" where "providerId" = ${provider}`
		await sql`delete from "User" where "id" = ${user}`
		await sql`delete from "Provider" where "id" in (${provider}, ${otherProvider})`
		await sql.end()
		await closePostgresClients()
	})
	const save = (overrides: Partial<Parameters<typeof saveTourComplianceContext>[0]> = {}) =>
		saveTourComplianceContext({
			productId: product,
			providerId: provider,
			actorUserId: user,
			input,
			operation,
			expectedRevision: 0,
			...overrides,
		})
	it("writes a normalized declaration and its audit atomically", async () => {
		const result = await save()
		expect(result.revision).toBe(1)
		expect(result.operationJson).toEqual(operation)
		const audit = await sql`select "action" from "ProviderAuditLog" where "entityId" = ${product}`
		expect(audit).toEqual([{ action: "tour_operation.updated" }])
	})
	it("rejects cross-provider writes without changing ownership", async () => {
		await save()
		await expect(save({ providerId: otherProvider, expectedRevision: 1 })).rejects.toThrow(
			"tour_context_not_found"
		)
		const [row] =
			await sql`select "providerId", "revision" from "TourComplianceContext" where "productId" = ${product}`
		expect(row).toEqual({ providerId: provider, revision: 1 })
	})
	it("rejects foreign resources and wrong operator types", async () => {
		await expect(save({ operation: { ...operation, resourceIds: [foreign] } })).rejects.toThrow(
			"invalid_tour_resource"
		)
		await expect(save({ operation: { ...operation, resourceIds: [partner] } })).rejects.toThrow(
			"invalid_tour_resource"
		)
	})
	it("rejects stale revisions without changing the stored declaration", async () => {
		await save()
		await expect(save({ operation: { ...operation, waterActivity: true } })).rejects.toThrow(
			"tour_context_conflict"
		)
		const [row] =
			await sql`select "revision" from "TourComplianceContext" where "productId" = ${product}`
		expect(row.revision).toBe(1)
	})
	it("permits only one concurrent update of the same revision", async () => {
		await save()
		const results = await Promise.allSettled([
			save({ expectedRevision: 1 }),
			save({ expectedRevision: 1 }),
		])
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
		const [row] =
			await sql`select "revision" from "TourComplianceContext" where "productId" = ${product}`
		expect(row.revision).toBe(2)
	})
	it("rolls back a declaration if the audit cannot be persisted", async () => {
		const failure = vi
			.spyOn(audit, "writeProviderAuditLog")
			.mockRejectedValueOnce(new Error("audit_unavailable"))
		try {
			await expect(save()).rejects.toThrow("audit_unavailable")
			expect(
				await sql`select "productId" from "TourComplianceContext" where "productId" = ${product}`
			).toHaveLength(0)
		} finally {
			failure.mockRestore()
		}
	})
	it("checks current membership permissions inside the write transaction", async () => {
		await expect(save({ actorUserId: randomUUID() })).rejects.toThrow("tour_context_forbidden")
		await sql`update "ProviderUser" set "role" = 'staff' where "providerId" = ${provider} and "userId" = ${user}`
		await expect(save()).rejects.toThrow("tour_context_forbidden")
	})
	it("preserves ambiguous historical context until explicitly replaced", async () => {
		await sql`insert into "TourComplianceContext" ("productId", "providerId", "operatingRole", "activityClassesJson", "jurisdictionCode", "jurisdictionCodes") values (${product}, ${provider}, 'guide', '["water_air"]', 'geo:bo:la-paz-department', '["geo:bo:la-paz-department"]')`
		const [row] =
			await sql`select "operationJson", "activityClassesJson", "revision" from "TourComplianceContext" where "productId" = ${product}`
		expect(row).toEqual({ operationJson: null, activityClassesJson: ["water_air"], revision: 0 })
		const saved = await save({ operation: { ...operation, waterActivity: true } })
		expect(saved.activityClassesJson).toEqual(["urban_cultural", "water"])
	})
	it("rejects malformed normalized JSON and negative revisions in PostgreSQL", async () => {
		await expect(
			sql`insert into "TourComplianceContext" ("productId", "providerId", "operationJson") values (${product}, ${provider}, '{"version":2}')`
		).rejects.toThrow(/TourComplianceContext_operation_check/)
		await expect(
			sql`insert into "TourComplianceContext" ("productId", "providerId", "revision") values (${product}, ${provider}, -1)`
		).rejects.toThrow(/TourComplianceContext_revision_check/)
	})
	it("rejects an external prestador without its country declaration", async () => {
		await expect(
			sql`insert into "TourOperationalResource" ("id", "providerId", "type", "name") values (${randomUUID()}, ${provider}, 'service_operator', 'Incomplete operator')`
		).rejects.toThrow(/TourOperationalResource_declaration_check/)
	})
	it("rejects a legal form belonging to a different country", async () => {
		await expect(
			sql`insert into "ProviderHolderProfile" ("providerId", "holderType", "holderCountry", "legalFormCode") values (${provider}, 'entidad', 'CL', 'BO:company')`
		).rejects.toThrow(/ProviderHolderProfile_legalFormCountry_check/)
	})
	it("saves legal classification without resetting a declared collection model", async () => {
		await sql`insert into "ProviderHolderProfile" ("providerId", "holderType", "holderCountry", "collectionModel", "declarationStatus") values (${provider}, 'persona_natural', 'BO', 'property_collect', 'verified')`
		await saveProviderHolderProfile({
			providerId: provider,
			userId: user,
			declaration: {
				holderType: "persona_natural",
				holderCountry: "BO",
				legalFormCode: "BO:sole_trader",
				taxResidenceCountry: null,
				payoutCountry: null,
				collectionModel: "undecided",
			},
		})
		const [row] =
			await sql`select "legalFormCode", "holderType", "collectionModel", "declarationStatus" from "ProviderHolderProfile" where "providerId" = ${provider}`
		expect(row).toEqual({
			legalFormCode: "BO:sole_trader",
			holderType: "persona_natural",
			collectionModel: "property_collect",
			declarationStatus: "in_review",
		})
	})
})
