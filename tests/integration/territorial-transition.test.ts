import { afterAll, describe, expect, it, vi } from "vitest"
import { hasIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { withPostgresTransaction, closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	db,
	eq,
	inArray,
	User,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	CommercialPolicyApproval,
	DocumentDefinitionVersion,
	AuditEvent,
	GeoPlace,
	and,
} from "@/shared/infrastructure/db/compat"
import { territorialRedesignDefinitions } from "@/lib/commercial-policy/territorial-redesign"
import { createDocumentDefinitionDraft } from "@/lib/documents/document-definitions"
import {
	loadCommercialPolicyForRatification,
	ratifyCommercialTourPolicy,
} from "@/lib/commercial-policy/ratification"
import {
	activateTerritorialTransition,
	previewTerritorialTransition,
} from "@/lib/commercial-policy/territorial-transition"

const state = vi.hoisted(() => ({ plan: { drafts: [] as any[] }, failRetirement: "" }))
vi.mock("@/lib/commercial-policy/territorial-redesign-load", () => ({
	readTerritorialRedesignSource: async () => ({ versions: [], countryTerritoryId: "synthetic-bo" }),
}))
vi.mock("@/lib/commercial-policy/territorial-redesign", async (original) => ({
	...(await original<typeof import("@/lib/commercial-policy/territorial-redesign")>()),
	prepareTerritorialRedesign: () => state.plan,
}))
vi.mock("@/lib/commercial-policy/policy-drafts", async (original) => {
	const actual = await original<typeof import("@/lib/commercial-policy/policy-drafts")>()
	return {
		...actual,
		retireCommercialTourPolicy: async (id: string) => {
			if (id === state.failRetirement) throw new Error("synthetic_last_retirement_failure")
			return actual.retireCommercialTourPolicy(id)
		},
	}
})

async function fixture() {
	state.failRetirement = ""
	state.plan = { drafts: [] }
	const actor = `territorial_reviewer_${crypto.randomUUID()}`
	await db.insert(User).values({ id: actor, email: `${actor}@fastt.test` })
	const definitionIds: Record<string, string> = {}
	for (const definition of territorialRedesignDefinitions())
		definitionIds[definition.key] = (await createDocumentDefinitionDraft(definition)).id
	let [country] = await db
		.select()
		.from(GeoPlace)
		.where(
			and(
				eq(GeoPlace.countryCode, "BO"),
				eq(GeoPlace.placeType, "country"),
				eq(GeoPlace.status, "active")
			)
		)
		.limit(1)
	if (!country)
		[country] = await db
			.insert(GeoPlace)
			.values({
				id: crypto.randomUUID(),
				countryCode: "BO",
				placeType: "country",
				canonicalName: "Bolivia sintética",
				normalizedName: "bolivia sintetica",
				slug: "bo",
				canonicalPath: "/bo",
			})
			.returning()
	const territoryId = crypto.randomUUID(),
		territorySlug = `synthetic-lp-${territoryId}`
	await db
		.insert(GeoPlace)
		.values({
			id: territoryId,
			countryCode: "BO",
			placeType: "admin_area_1",
			parentId: country.id,
			canonicalName: "La Paz sintética",
			normalizedName: territorySlug,
			slug: territorySlug,
			canonicalPath: `${country.canonicalPath}/${territorySlug}`,
		})
	const context = {
		contextVersion: 2,
		operatingRoles: ["guide"],
		activityClasses: ["urban_cultural"],
		jurisdictionCodes: [territoryId],
		experienceFormats: ["guided_tour"],
	}
	const entries = []
	for (let index = 0; index < 7; index++) {
		const setId = crypto.randomUUID(),
			baseId = crypto.randomUUID(),
			draftId = crypto.randomUUID()
		await db.insert(CompliancePolicySet).values({
			id: setId,
			key: `synthetic-territorial-${setId}`,
			label: `Synthetic La Paz policy ${index}`,
			country: "BO",
			vertical: "tour",
			policyScope: "commercial",
			holderType: "persona_natural",
			jurisdictionRole: "holder",
			collectionModel: "property_collect",
		})
		for (const [id, version] of [
			[baseId, 1],
			[draftId, 2],
		] as const) {
			await db.insert(CompliancePolicyVersion).values({
				id,
				policySetId: setId,
				version,
				status: "draft",
				effectiveFrom: new Date("2026-01-01"),
				contextJson: context,
			})
			await db.insert(ComplianceRequirementRule).values({
				id: crypto.randomUUID(),
				policyVersionId: id,
				requirementKey: `synthetic-${index}`,
				domain: "verification",
				required: true,
				conditionJson: { evidenceScope: "provider", evidenceSubjectSelector: "holder" },
				capabilitiesJson: ["publish", "booking"],
				acceptedEvidenceJson:
					version === 1
						? ["government_id"]
						: {
								version: 1,
								alternatives: [
									{
										id: "holder",
										allOf: [{ definitionVersionId: Object.values(definitionIds)[index % 4] }],
									},
								],
							},
				blockingAction: "Review synthetic evidence",
				reviewOwner: "Synthetic reviewer",
				sourceKind: "fastt_policy",
				sourceReference: "Synthetic certification only",
				sourceCheckedAt: new Date("2026-01-01"),
			})
		}
		for (const area of ["policy", "finance", "tour_operations"] as const)
			await ratifyCommercialTourPolicy({
				policyVersionId: baseId,
				approvalArea: area,
				approverUserId: actor,
				approvalReference: "Synthetic base certification",
			})
		const draft = (await loadCommercialPolicyForRatification(draftId))!
		const retireAfterPublication = index < 5 ? [baseId] : []
		entries.push({ id: draftId, retireAfterPublication })
		state.plan.drafts.push({
			policySetId: setId,
			context,
			requirements: draft.requirements,
			retireAfterPublication,
		})
	}
	await db.insert(AuditEvent).values({
		id: crypto.randomUUID(),
		requestId: crypto.randomUUID(),
		actorUserId: actor,
		action: "commercial_policy.territorial_drafts_prepared",
		entityType: "CommercialPolicyDraftBundle",
		entityId: "bo-tour-territorial-redesign-v1",
		riskLevel: "high",
		afterJson: { publicationAuthorized: false, drafts: entries, definitionIds },
	})
	return { actor, entries, definitionIds }
}

async function scenario(work: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
	const rollback = new Error("ROLLBACK_TERRITORIAL_CERTIFICATION")
	await expect(
		withPostgresTransaction(async () => {
			await work(await fixture())
			throw rollback
		})
	).rejects.toBe(rollback)
}

describe.skipIf(!hasIsolatedTestDatabase())(
	"coordinated territorial transition on isolated Postgres",
	() => {
		afterAll(closePostgresClients)
		it("publishes seven policies and four definitions, retires five sources, and replays without duplicates", async () =>
			scenario(async (f) => {
				const preview = await previewTerritorialTransition()
				const input = {
					fingerprint: preview.fingerprint,
					actorUserId: f.actor,
					approvalReference: "Synthetic coordinated La Paz certification",
				}
				const result = await activateTerritorialTransition(input)
				expect(result.result).toMatchObject({
					publishedPolicies: 7,
					publishedDefinitions: 4,
					retiredPolicies: 5,
				})
				expect((await activateTerritorialTransition(input)).replayed).toBe(true)
				expect(
					await db
						.select()
						.from(CommercialPolicyApproval)
						.where(
							inArray(
								CommercialPolicyApproval.policyVersionId,
								f.entries.map((e) => e.id)
							)
						)
				).toHaveLength(21)
				expect(
					(
						await db
							.select()
							.from(DocumentDefinitionVersion)
							.where(inArray(DocumentDefinitionVersion.id, Object.values(f.definitionIds)))
					).every((d) => d.status === "published")
				).toBe(true)
			}))
		it("rolls back every publication and signature if the last retirement fails", async () =>
			scenario(async (f) => {
				const preview = await previewTerritorialTransition()
				state.failRetirement = preview.retirements
					.map((r) => r.id)
					.sort()
					.at(-1)!
				await expect(
					withPostgresTransaction(
						() =>
							activateTerritorialTransition({
								fingerprint: preview.fingerprint,
								actorUserId: f.actor,
								approvalReference: "Synthetic rollback certification",
							}),
						{ savepoint: true }
					)
				).rejects.toThrow("synthetic_last_retirement_failure")
				expect(
					(
						await db
							.select()
							.from(CompliancePolicyVersion)
							.where(
								inArray(
									CompliancePolicyVersion.id,
									f.entries.map((e) => e.id)
								)
							)
					).every((v) => v.status === "draft")
				).toBe(true)
				expect(
					await db
						.select()
						.from(CommercialPolicyApproval)
						.where(
							inArray(
								CommercialPolicyApproval.policyVersionId,
								f.entries.map((e) => e.id)
							)
						)
				).toHaveLength(0)
				expect(
					(
						await db
							.select()
							.from(DocumentDefinitionVersion)
							.where(inArray(DocumentDefinitionVersion.id, Object.values(f.definitionIds)))
					).every((d) => d.status === "draft")
				).toBe(true)
				expect(
					(
						await db
							.select()
							.from(CompliancePolicyVersion)
							.where(
								inArray(
									CompliancePolicyVersion.id,
									preview.retirements.map((r) => r.id)
								)
							)
					).every((v) => v.status === "published")
				).toBe(true)
			}))
		it("rejects direct approval of a pending bundle version", async () =>
			scenario(async (f) => {
				await expect(
					ratifyCommercialTourPolicy({
						policyVersionId: f.entries[0].id,
						approvalArea: "policy",
						approverUserId: f.actor,
						approvalReference: "Synthetic direct attempt",
					})
				).rejects.toThrow("commercial_policy_not_publishable")
			}))
	}
)
