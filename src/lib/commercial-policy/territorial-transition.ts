import { z } from "zod"
import {
	db,
	eq,
	and,
	inArray,
	sql,
	AuditEvent,
	DocumentDefinition,
	DocumentDefinitionVersion,
} from "@/shared/infrastructure/db/compat"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { commandPayloadHash } from "@/lib/commands/command-idempotency"
import { transitionDocumentDefinition } from "@/lib/documents/document-definitions"
import { prepareTerritorialRedesign, territorialRedesignDefinitions } from "./territorial-redesign"
import { readTerritorialRedesignSource } from "./territorial-redesign-load"
import { loadCommercialPolicyForRatification, ratifyCommercialTourPolicy } from "./ratification"
import { normalizeContextSelector, parsePolicyRequirement } from "./contract-parser"
import { retireCommercialTourPolicy } from "./policy-drafts"
import { packageApprovalAreas } from "./package-ratification"
import { tourPolicyPublicationErrors } from "./evaluate"
import { withTerritorialTransition } from "./territorial-transition-context"

const bundleKey = "bo-tour-territorial-redesign-v1"
export async function readAppliedTerritorialTransition() {
	const [row] = await db
		.select({ result: AuditEvent.afterJson })
		.from(AuditEvent)
		.where(
			and(
				eq(AuditEvent.entityId, bundleKey),
				eq(AuditEvent.action, "commercial_policy.territorial_transition_applied")
			)
		)
	return row?.result ?? null
}
const bundleSchema = z.object({
	publicationAuthorized: z.literal(false),
	drafts: z
		.array(z.object({ id: z.string().uuid(), retireAfterPublication: z.array(z.string()) }))
		.length(7),
	definitionIds: z.record(z.string(), z.string().uuid()),
})

async function bundle() {
	const [row] = await db
		.select({ value: AuditEvent.afterJson })
		.from(AuditEvent)
		.where(
			and(
				eq(AuditEvent.entityId, bundleKey),
				eq(AuditEvent.action, "commercial_policy.territorial_drafts_prepared")
			)
		)
	if (!row) throw new Error("territorial_bundle_not_prepared")
	return bundleSchema.parse(row.value)
}

function rulesContract(
	rules: NonNullable<
		Awaited<ReturnType<typeof loadCommercialPolicyForRatification>>
	>["requirements"]
) {
	return rules
		.map((rule) =>
			parsePolicyRequirement({
				requirementKey: rule.key,
				required: rule.required,
				conditionJson: rule.condition,
				capabilitiesJson: rule.capabilities,
				acceptedEvidenceJson: rule.documentAcceptance ?? rule.acceptedEvidence,
				blockingAction: rule.blockingAction,
				reviewOwner: rule.reviewOwner,
				sourceKind: rule.sourceKind ?? null,
				sourceReference: rule.sourceReference ?? null,
				sourceCheckedAt: rule.sourceCheckedAt ?? null,
			})
		)
		.sort((a, b) => a.key.localeCompare(b.key))
}

async function snapshot() {
	const saved = await bundle()
	const source = await readTerritorialRedesignSource()
	const plan = prepareTerritorialRedesign({ ...source, definitionIds: saved.definitionIds })
	const ids = Object.values(saved.definitionIds)
	if (new Set(ids).size !== 4) throw new Error("territorial_definition_set_changed")
	const definitions = await db
		.select({ version: DocumentDefinitionVersion, key: DocumentDefinition.key })
		.from(DocumentDefinitionVersion)
		.innerJoin(
			DocumentDefinition,
			eq(DocumentDefinition.id, DocumentDefinitionVersion.definitionId)
		)
		.where(inArray(DocumentDefinitionVersion.id, ids))
	for (const expected of territorialRedesignDefinitions()) {
		const actual = definitions.find(
			(d) => d.key === expected.key && d.version.id === saved.definitionIds[expected.key]
		)
		if (
			!actual ||
			actual.version.status !== "draft" ||
			commandPayloadHash({
				key: actual.key,
				label: actual.version.label,
				description: actual.version.description,
				family: actual.version.family,
				capture: actual.version.captureJson,
			}) !== commandPayloadHash(expected)
		)
			throw new Error("territorial_definition_contract_changed")
	}
	const versions = []
	for (const entry of saved.drafts) {
		const version = await loadCommercialPolicyForRatification(entry.id)
		const proposed = plan.drafts.find((d) => d.policySetId === version?.policySetId)
		if (
			!version ||
			!proposed ||
			version.status !== "draft" ||
			version.signatures.length ||
			commandPayloadHash(normalizeContextSelector(proposed.context)) !==
				commandPayloadHash(version.context) ||
			commandPayloadHash(rulesContract(proposed.requirements)) !==
				commandPayloadHash(rulesContract(version.requirements)) ||
			commandPayloadHash([...entry.retireAfterPublication].sort()) !==
				commandPayloadHash([...proposed.retireAfterPublication].sort())
		)
			throw new Error("territorial_policy_contract_changed")
		const errors = tourPolicyPublicationErrors(version).filter(
			(e) =>
				!["tour_policy_signatures_incomplete", "tour_policy_approval_metadata_missing"].includes(e)
		)
		if (
			errors.length ||
			version.effectiveFrom > new Date() ||
			(version.effectiveTo && version.effectiveTo <= new Date())
		)
			throw new Error("territorial_policy_not_publishable")
		versions.push(version)
	}
	if (new Set(versions.map((v) => v.policySetId)).size !== 7)
		throw new Error("territorial_policy_set_changed")
	const retirementIds = [...new Set(plan.drafts.flatMap((d) => d.retireAfterPublication))].sort()
	const retirements = []
	for (const id of retirementIds) {
		const version = await loadCommercialPolicyForRatification(id)
		if (!version || version.status !== "published")
			throw new Error("territorial_retirement_changed")
		retirements.push(version)
	}
	return {
		saved,
		definitions,
		versions,
		retirements,
		fingerprint: commandPayloadHash({ saved, definitions, versions, retirements }),
	}
}

export async function previewTerritorialTransition() {
	return withPostgresTransaction(async () => {
		const state = await snapshot()
		return {
			fingerprint: state.fingerprint,
			versions: state.versions.map((v) => ({
				id: v.id,
				label: v.label,
				version: v.versionNumber,
				holderType: v.holderType,
			})),
			definitions: state.definitions.map((d) => ({ id: d.version.id, label: d.version.label })),
			retirements: state.retirements.map((v) => ({
				id: v.id,
				label: v.label,
				version: v.versionNumber,
				holderType: v.holderType,
			})),
		}
	})
}

/** Caller enforces all three approval areas, policy.publish, retirement permission and recent MFA. */
export async function activateTerritorialTransition(input: {
	fingerprint: string
	approvalReference: string
	actorUserId: string
}) {
	if (input.approvalReference.trim().length < 10 || input.approvalReference.length > 500)
		throw new Error("territorial_review_reference_required")
	return withPostgresTransaction(async () => {
		await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${bundleKey},0))`)
		const [applied] = await db
			.select({ result: AuditEvent.afterJson })
			.from(AuditEvent)
			.where(
				and(
					eq(AuditEvent.entityId, bundleKey),
					eq(AuditEvent.action, "commercial_policy.territorial_transition_applied")
				)
			)
		if (applied) return { replayed: true, result: applied.result }
		const saved = await bundle()
		const lockIds = [
			...new Set([
				...saved.drafts.map((d) => d.id),
				...saved.drafts.flatMap((d) => d.retireAfterPublication),
			]),
		].sort()
		for (const id of lockIds)
			await db.execute(sql`SELECT id FROM "CompliancePolicyVersion" WHERE id=${id} FOR UPDATE`)
		for (const id of Object.values(saved.definitionIds).sort())
			await db.execute(sql`SELECT id FROM "DocumentDefinitionVersion" WHERE id=${id} FOR UPDATE`)
		const state = await snapshot()
		if (state.fingerprint !== input.fingerprint) throw new Error("territorial_package_changed")
		for (const definition of state.definitions) {
			await transitionDocumentDefinition(definition.version.id, "publish")
			await db.insert(AuditEvent).values({
				id: crypto.randomUUID(),
				requestId: crypto.randomUUID(),
				actorUserId: input.actorUserId,
				action: "document_definition.publish",
				entityType: "DocumentDefinitionVersion",
				entityId: definition.version.id,
				riskLevel: "high",
				afterJson: { bundleKey, status: "published", approvalReference: input.approvalReference },
			})
		}
		await withTerritorialTransition(
			state.versions.map((v) => v.id),
			async () => {
				for (const version of state.versions)
					for (const area of packageApprovalAreas)
						await ratifyCommercialTourPolicy({
							policyVersionId: version.id,
							approvalArea: area,
							approverUserId: input.actorUserId,
							approvalReference: input.approvalReference,
						})
				for (const target of state.retirements) {
					await retireCommercialTourPolicy(target.id)
					await db.insert(AuditEvent).values({
						id: crypto.randomUUID(),
						requestId: crypto.randomUUID(),
						actorUserId: input.actorUserId,
						action: "commercial_policy.retire",
						entityType: "CompliancePolicyVersion",
						entityId: target.id,
						riskLevel: "high",
						beforeJson: { status: "published" },
						afterJson: { status: "retired", bundleKey },
					})
				}
			}
		)
		const result = {
			publishedPolicies: state.versions.length,
			publishedDefinitions: state.definitions.length,
			retiredPolicies: state.retirements.length,
			fingerprint: state.fingerprint,
		}
		await db.insert(AuditEvent).values({
			id: crypto.randomUUID(),
			requestId: crypto.randomUUID(),
			actorUserId: input.actorUserId,
			action: "commercial_policy.territorial_transition_applied",
			entityType: "CommercialPolicyDraftBundle",
			entityId: bundleKey,
			riskLevel: "high",
			afterJson: result,
		})
		return { replayed: false, result }
	})
}
