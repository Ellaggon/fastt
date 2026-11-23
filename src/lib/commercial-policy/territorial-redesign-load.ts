import {
	db,
	sql,
	eq,
	and,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	GeoPlace,
	AuditEvent,
	CommercialPolicyApproval,
	inArray,
} from "@/shared/infrastructure/db/compat"
import { z } from "zod"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { createDocumentDefinitionDraft } from "@/lib/documents/document-definitions"
import { createCommercialPolicyDraftFromVersion } from "./policy-drafts"
import { loadCommercialPolicyForRatification } from "./ratification"
import { prepareTerritorialRedesign, territorialRedesignDefinitions } from "./territorial-redesign"

const bundleKey = "bo-tour-territorial-redesign-v1"
const bundleSchema = z.object({ drafts: z.array(z.object({ id: z.string().uuid() })).length(7) })

async function reconcileDraftDomains(result: unknown, actorUserId: string) {
	const { drafts } = bundleSchema.parse(result)
	const ids = drafts.map((draft) => draft.id)
	await db.execute(
		sql`SELECT id FROM "CompliancePolicyVersion" WHERE id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `
		)}) ORDER BY id FOR UPDATE`
	)
	const versions = await db
		.select({
			id: CompliancePolicyVersion.id,
			status: CompliancePolicyVersion.status,
			role: CompliancePolicySet.jurisdictionRole,
		})
		.from(CompliancePolicyVersion)
		.innerJoin(CompliancePolicySet, eq(CompliancePolicySet.id, CompliancePolicyVersion.policySetId))
		.where(inArray(CompliancePolicyVersion.id, ids))
	const approvals = await db
		.select({ id: CommercialPolicyApproval.id })
		.from(CommercialPolicyApproval)
		.where(inArray(CommercialPolicyApproval.policyVersionId, ids))
	if (
		versions.length !== ids.length ||
		versions.some((v) => v.status !== "draft") ||
		approvals.length
	)
		throw new Error("unsigned_territorial_drafts_required")
	const changes = []
	for (const version of versions) {
		const domain =
			version.role === "tax" ? "fiscal" : version.role === "holder" ? "verification" : "documents"
		const rules = await db
			.select({ id: ComplianceRequirementRule.id, domain: ComplianceRequirementRule.domain })
			.from(ComplianceRequirementRule)
			.where(eq(ComplianceRequirementRule.policyVersionId, version.id))
		for (const rule of rules) {
			if (rule.domain === domain) continue
			await db
				.update(ComplianceRequirementRule)
				.set({ domain })
				.where(eq(ComplianceRequirementRule.id, rule.id))
			changes.push({ ruleId: rule.id, before: rule.domain, after: domain })
		}
	}
	if (changes.length)
		await db.insert(AuditEvent).values({
			id: crypto.randomUUID(),
			requestId: crypto.randomUUID(),
			actorUserId,
			action: "commercial_policy.territorial_draft_domains_corrected",
			entityType: "CommercialPolicyDraftBundle",
			entityId: bundleKey,
			riskLevel: "high",
			afterJson: { changes },
		})
	return changes.length
}
export async function readTerritorialRedesignSource() {
	const [country] = await db
		.select({ id: GeoPlace.id })
		.from(GeoPlace)
		.where(
			and(
				eq(GeoPlace.countryCode, "BO"),
				eq(GeoPlace.placeType, "country"),
				eq(GeoPlace.status, "active")
			)
		)
	if (!country) throw new Error("national_territory_required")
	const rows = await db
		.select({ id: CompliancePolicyVersion.id })
		.from(CompliancePolicyVersion)
		.innerJoin(CompliancePolicySet, eq(CompliancePolicySet.id, CompliancePolicyVersion.policySetId))
		.where(
			and(
				eq(CompliancePolicySet.country, "BO"),
				eq(CompliancePolicySet.vertical, "tour"),
				eq(CompliancePolicySet.policyScope, "commercial"),
				eq(CompliancePolicySet.status, "active"),
				eq(CompliancePolicyVersion.status, "published")
			)
		)
	const loaded = await Promise.all(rows.map((row) => loadCommercialPolicyForRatification(row.id)))
	return {
		countryTerritoryId: country.id,
		versions: loaded.filter((v): v is NonNullable<typeof v> & { policySetId: string } =>
			Boolean(v?.policySetId)
		),
	}
}
export async function previewTerritorialRedesign() {
	const snapshot = await readTerritorialRedesignSource()
	return prepareTerritorialRedesign({
		...snapshot,
		definitionIds: Object.fromEntries(
			territorialRedesignDefinitions().map((def) => [def.key, `pending:${def.key}`])
		),
	})
}

/** Caller must require policy.edit and recent MFA. Never grants access or publishes. */
export async function loadTerritorialRedesignDrafts(actorUserId: string) {
	return withPostgresTransaction(async () => {
		await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${bundleKey},0))`)
		const [existing] = await db
			.select({ result: AuditEvent.afterJson })
			.from(AuditEvent)
			.where(
				and(
					eq(AuditEvent.action, "commercial_policy.territorial_drafts_prepared"),
					eq(AuditEvent.entityId, bundleKey)
				)
			)
		if (existing) {
			const correctedRules = await reconcileDraftDomains(existing.result, actorUserId)
			return { reused: true, result: existing.result, correctedRules }
		}
		const snapshot = await readTerritorialRedesignSource()
		// Reconcile the whole source before creating the first draft.
		prepareTerritorialRedesign({
			...snapshot,
			definitionIds: Object.fromEntries(
				territorialRedesignDefinitions().map((def) => [def.key, `pending:${def.key}`])
			),
		})
		const definitionIds: Record<string, string> = {}
		for (const definition of territorialRedesignDefinitions())
			definitionIds[definition.key] = (await createDocumentDefinitionDraft(definition)).id
		const plan = prepareTerritorialRedesign({ ...snapshot, definitionIds })
		const drafts = []
		for (const proposal of plan.drafts) {
			const form = new FormData()
			form.set("baseVersionId", proposal.baseVersionId)
			const created = await createCommercialPolicyDraftFromVersion(form)
			await db
				.update(CompliancePolicyVersion)
				.set({ contextJson: proposal.context })
				.where(
					and(
						eq(CompliancePolicyVersion.id, created.id),
						eq(CompliancePolicyVersion.status, "draft")
					)
				)
			await db
				.delete(ComplianceRequirementRule)
				.where(eq(ComplianceRequirementRule.policyVersionId, created.id))
			for (const rule of proposal.requirements)
				await db.insert(ComplianceRequirementRule).values({
					id: crypto.randomUUID(),
					policyVersionId: created.id,
					requirementKey: rule.key,
					domain: proposal.domain,
					required: rule.required,
					conditionJson: rule.condition,
					capabilitiesJson: rule.capabilities,
					acceptedEvidenceJson: rule.documentAcceptance ?? rule.acceptedEvidence,
					blockingAction: rule.blockingAction,
					reviewOwner: rule.reviewOwner,
					sourceKind: rule.sourceKind,
					sourceReference: rule.sourceReference,
					sourceCheckedAt: rule.sourceCheckedAt,
				})
			drafts.push({
				id: created.id,
				label: proposal.label,
				version: created.version,
				retireAfterPublication: proposal.retireAfterPublication,
			})
		}
		const result = {
			status: "draft",
			drafts,
			definitionIds,
			publicationAuthorized: false,
			pendingReview: plan.pendingReview,
			preserved: plan.preserved,
		}
		await db.insert(AuditEvent).values({
			id: crypto.randomUUID(),
			requestId: crypto.randomUUID(),
			actorUserId,
			action: "commercial_policy.territorial_drafts_prepared",
			entityType: "CommercialPolicyDraftBundle",
			entityId: bundleKey,
			riskLevel: "high",
			afterJson: result,
		})
		return { reused: false, result }
	})
}
