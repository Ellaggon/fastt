import postgres from "postgres"
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
suite("native composable policy integrity", () => {
	let sql: postgres.Sql
	beforeAll(() => {
		if (isolated.configured) sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 1 })
	})
	afterAll(async () => {
		if (sql) await sql.end()
	})
	async function fixture(
		work: (tx: postgres.TransactionSql, setId: string, placeId: string) => Promise<void>
	) {
		await sql
			.begin(async (tx) => {
				const id = crypto.randomUUID(),
					placeId = `geo:test:${id}`
				await tx`INSERT INTO "GeoPlace" (id,"canonicalName","normalizedName",slug,"canonicalPath","placeType","countryCode") VALUES (${placeId},${id},${id},${id},${"/" + id},'country','ZZ')`
				await tx`INSERT INTO "CompliancePolicySet" (id,key,label,country,vertical,"collectionModel","policyScope","holderType","jurisdictionRole") VALUES (${id},${id},'Test','ZZ','tour','property_collect','commercial','persona_natural','product')`
				await work(tx, id, placeId)
				throw new Error("rollback_fixture")
			})
			.catch((error) => {
				if (error.message !== "rollback_fixture") throw error
			})
	}
	const context = (placeId: string, replacesVersionIds: string[] = []) => ({
		contextVersion: 3,
		experienceFormats: ["guided_tour"],
		operatingRoles: ["guide"],
		activityClasses: ["cultural"],
		jurisdictionCodes: [placeId],
		composition: {
			kind: "requirements",
			family: "tourism",
			requiredFamilies: [],
			replacesVersionIds,
		},
	})
	it("allows version 3 and rejects unknown families and self-replacement", async () =>
		fixture(async (tx, setId, placeId) => {
			const id = crypto.randomUUID(),
				payload = context(placeId)
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson") VALUES (${id},${setId},1,now(),${tx.json(payload)})`
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "CompliancePolicyVersion" SET "contextJson" = ${sp.json({ ...payload, composition: { ...payload.composition, family: "unknown" } })} WHERE id = ${id}`
				})
			).rejects.toThrow("invalid_policy_composition")
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "CompliancePolicyVersion" SET "contextJson" = ${sp.json(context(placeId, [id]))} WHERE id = ${id}`
				})
			).rejects.toThrow("invalid_policy_replacement")
		}))
	it("protects referenced versions and signed requirement content", async () =>
		fixture(async (tx, setId, placeId) => {
			const old = crypto.randomUUID(),
				successor = crypto.randomUUID(),
				rule = crypto.randomUUID()
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson") VALUES (${old},${setId},1,now(),${tx.json(context(placeId))})`
			await tx`INSERT INTO "ComplianceRequirementRule" (id,"policyVersionId",domain,"requirementKey") VALUES (${rule},${old},'documents','license')`
			await tx`UPDATE "CompliancePolicyVersion" SET status = 'published' WHERE id = ${old}`
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "CompliancePolicyVersion" SET "effectiveTo" = now() + interval '1 year' WHERE id = ${old}`
				})
			).rejects.toThrow("signed_policy_validity_immutable")
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson") VALUES (${successor},${setId},2,now(),${tx.json(context(placeId, [old]))})`
			await expect(
				tx.savepoint(async (sp) => {
					await sp`DELETE FROM "CompliancePolicyVersion" WHERE id = ${old}`
				})
			).rejects.toThrow("signed_policy_contract_immutable")
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "ComplianceRequirementRule" SET "required" = false WHERE id = ${rule}`
				})
			).rejects.toThrow("signed_policy_rule_immutable")
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "CompliancePolicySet" SET country = 'BO' WHERE id = ${setId}`
				})
			).rejects.toThrow("signed_policy_set_immutable")
		}))
	it("does not revive predecessors when a successor is retired", async () =>
		fixture(async (tx, setId, placeId) => {
			const old = crypto.randomUUID(),
				successor = crypto.randomUUID()
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson",status) VALUES (${old},${setId},1,now(),${tx.json(context(placeId))},'published')`
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson",status) VALUES (${successor},${setId},2,now(),${tx.json(context(placeId, [old]))},'published')`
			await expect(
				tx.savepoint(async (sp) => {
					await sp`UPDATE "CompliancePolicyVersion" SET status = 'retired' WHERE id = ${successor}`
				})
			).rejects.toThrow("policy_successor_retirement_requires_replacement")
		}))
	it("retains legacy version 2 payloads byte-for-byte", async () =>
		fixture(async (tx, setId, placeId) => {
			const id = crypto.randomUUID(),
				payload = {
					contextVersion: 2,
					experienceFormats: ["guided_tour"],
					operatingRoles: ["guide"],
					activityClasses: ["cultural"],
					jurisdictionCodes: [placeId],
				}
			await tx`INSERT INTO "CompliancePolicyVersion" (id,"policySetId",version,"effectiveFrom","contextJson") VALUES (${id},${setId},1,now(),${tx.json(payload)})`
			const [before] =
				await tx`SELECT "contextJson"::text AS payload FROM "CompliancePolicyVersion" WHERE id = ${id}`
			await tx`UPDATE "CompliancePolicyVersion" SET status = 'published' WHERE id = ${id}`
			const [after] =
				await tx`SELECT "contextJson"::text AS payload FROM "CompliancePolicyVersion" WHERE id = ${id}`
			expect(after.payload).toBe(before.payload)
		}))
})
