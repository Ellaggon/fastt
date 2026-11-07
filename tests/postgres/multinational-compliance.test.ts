import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import {
	normalizeContextSelector,
	parsePolicyRequirement,
} from "@/lib/commercial-policy/contract-parser"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyVersion,
} from "@/lib/commercial-policy/evaluate"
import {
	compareComplianceSnapshots,
	readComplianceSnapshot,
} from "@/lib/commercial-policy/migration-integrity"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
suite("synthetic multinational configuration, not legal certification", () => {
	let sql: postgres.Sql
	beforeAll(() => {
		if (isolated.configured)
			sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 1, prepare: false })
	})
	afterAll(async () => {
		if (sql) await sql.end()
	})
	for (const country of ["BO", "CL"])
		it(`persists and evaluates ${country} using the same contract`, async () => {
			const rollback = new Error("synthetic_rollback")
			await expect(
				sql.begin(async (tx) => {
					const prefix = `synthetic-${crypto.randomUUID()}`,
						place = `${prefix}-place`
					await tx`insert into "GeoPlace" (id, "canonicalName", "normalizedName", slug, "canonicalPath", "placeType", "countryCode") values (${place}, 'Synthetic territory', 'synthetic territory', ${prefix}, ${prefix}, 'country', ${country})`
					const signerIds = ["policy", "finance", "tour_operations"].map(
						(area) => `${prefix}-${area}`
					)
					for (const id of signerIds)
						await tx`insert into "User" (id, email) values (${id}, ${`${id}@example.invalid`})`
					const definition = `${prefix}-definition`
					await tx`insert into "DocumentDefinition" (id, key) values (${definition}, ${definition})`
					await tx`insert into "DocumentDefinitionVersion" (id, "definitionId", version, status, label, description, family, "captureJson") values (${definition}, ${definition}, 1, 'published', 'Synthetic evidence', 'Not a legal requirement', 'government_id', '{}')`
					const versions: CommercialPolicyVersion[] = []
					for (const kind of ["holder", "tax", "admission", "requirements"] as const) {
						const id = `${prefix}-${kind}`,
							role = kind === "admission" || kind === "requirements" ? "product" : kind
						const selector = {
							contextVersion: kind === "holder" || kind === "tax" ? 2 : 3,
							experienceFormats: ["guided_tour"],
							operatingRoles: ["guide"],
							activityClasses: ["urban_cultural"],
							jurisdictionCodes: [place],
							...(role === "product"
								? {
										composition: {
											kind,
											family: "tourism",
											requiredFamilies: kind === "admission" ? ["tourism"] : [],
											replacesVersionIds: [],
										},
									}
								: {}),
						}
						await tx`insert into "CompliancePolicySet" (id, key, label, country, vertical, "collectionModel", "policyScope", "holderType", "jurisdictionRole", status) values (${id}, ${id}, 'SYNTHETIC ONLY', ${country}, 'tour', 'property_collect', 'commercial', 'persona_natural', ${role}, 'active')`
						await tx`insert into "CompliancePolicyVersion" (id, "policySetId", version, "effectiveFrom", "contextJson") values (${id}, ${id}, 1, '2026-01-01', ${tx.json(selector)})`
						if (kind !== "admission")
							await tx`insert into "ComplianceRequirementRule" (id, "policyVersionId", domain, "requirementKey", "capabilitiesJson", "acceptedEvidenceJson", "conditionJson", "blockingAction", "reviewOwner", "sourceKind", "sourceReference", "sourceCheckedAt") values (${id}, ${id}, 'documents', ${id}, '["publish","booking"]', ${tx.json({ version: 1, alternatives: [{ id: "synthetic", allOf: [{ definitionVersionId: definition }] }] })}, '{"evidenceScope":"provider","evidenceSubjectSelector":"holder"}', 'Synthetic evidence only', 'policies', 'fastt_policy', 'SYNTHETIC-NOT-LAW', '2026-01-01')`
						for (const [index, area] of ["policy", "finance", "tour_operations"].entries())
							await tx`insert into "CommercialPolicyApproval" (id, "policyVersionId", "approvalArea", "approverUserId", "approvalReference", "approvedAt") values (${`${id}-${area}`}, ${id}, ${area}, ${signerIds[index]}, 'SYNTHETIC', '2026-01-01')`
						await tx`update "CompliancePolicyVersion" set status = 'published', "approvedBy" = ${signerIds[0]}, "approvedAt" = '2026-01-01', "approvalReference" = 'SYNTHETIC' where id = ${id}`
						const [stored] = await tx<
							Array<
								Pick<
									CommercialPolicyVersion,
									| "status"
									| "effectiveFrom"
									| "effectiveTo"
									| "approvedBy"
									| "approvedAt"
									| "approvalReference"
								> & { contextJson: unknown }
							>
						>`select * from "CompliancePolicyVersion" where id = ${id}`
						const rules =
							await tx`select * from "ComplianceRequirementRule" where "policyVersionId" = ${id}`
						const signatures = await tx<
							NonNullable<CommercialPolicyVersion["signatures"]>
						>`select * from "CommercialPolicyApproval" where "policyVersionId" = ${id}`
						versions.push({
							...stored,
							id,
							policySetId: id,
							jurisdictionRole: role,
							country,
							vertical: "tour",
							holderType: "persona_natural",
							collectionModel: "property_collect",
							context: normalizeContextSelector(stored.contextJson),
							requirements: rules.map((rule) =>
								parsePolicyRequirement(rule as Parameters<typeof parsePolicyRequirement>[0])
							),
							signatures,
						})
					}
					const before = await readComplianceSnapshot(tx)
					const context = {
						providerId: prefix,
						evidenceSubjects: { holder: [prefix] },
						holderType: "persona_natural" as const,
						holderCountry: country,
						taxCountry: country,
						productCountry: country,
						payoutCountry: null,
						vertical: "tour" as const,
						collectionModel: "property_collect" as const,
						experienceFormat: "guided_tour" as const,
						operatingRole: "guide" as const,
						jurisdictionCodes: [place],
						jurisdictionCode: place,
						activityClasses: ["urban_cultural"],
					}
					const input = {
						context,
						versions,
						now: new Date("2026-10-31T12:00:00Z"),
						evidence: [
							{
								id: `${prefix}-evidence`,
								type: "government_id",
								definitionVersionId: definition,
								subjectType: "provider" as const,
								subjectReference: prefix,
								status: "verified" as const,
							},
						],
					}
					const diagnosis = evaluateCommercialPolicy(input)
					expect(diagnosis.capabilities.publish, JSON.stringify(diagnosis)).toBe(true)
					expect(evaluateCommercialPolicy({ ...input, evidence: [] }).capabilities.publish).toBe(
						false
					)
					expect(
						evaluateCommercialPolicy({
							...input,
							versions: versions.filter((version) => !version.id.endsWith("-admission")),
						}).capabilities.publish
					).toBe(false)
					expect(
						evaluateCommercialPolicy({ ...input, context: { ...context, productCountry: "XX" } })
							.capabilities.publish
					).toBe(false)
					expect(compareComplianceSnapshots(before, await readComplianceSnapshot(tx))).toEqual([])
					throw rollback
				})
			).rejects.toBe(rollback)
		})
})
