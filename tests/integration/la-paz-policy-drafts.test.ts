import { expect, it } from "vitest"
import proposal from "../fixtures/commercial-policy/bo-la-paz-urban.draft.json"
import { prepareLaPazReviewPackage } from "@/lib/commercial-policy/la-paz-review-package"
import { ensureOperatingGeographyFixtures } from "../test-support/operating-geography"
import {
	createCommercialPolicyDraft,
	addCommercialPolicyDraftRule,
} from "@/lib/commercial-policy/policy-drafts"
import {
	createDocumentDefinitionDraft,
	transitionDocumentDefinition,
} from "@/lib/documents/document-definitions"
import { composePolicyVersions, compositionSchema } from "@/lib/commercial-policy/composition"
import { documentAcceptanceSchema } from "@/shared/domain/document-acceptance"
import {
	normalizeContextSelector,
	parsePolicyRequirement,
} from "@/lib/commercial-policy/contract-parser"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyVersion,
	type CommercialPolicyContext,
	type CommercialEvidence,
} from "@/lib/commercial-policy/evaluate"
import {
	db,
	eq,
	CommercialPolicyApproval,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
} from "@/shared/infrastructure/db/compat"

it("prepares both La Paz admissions and document definitions without ratification or activation", async () => {
	await ensureOperatingGeographyFixtures()
	const suffix = crypto.randomUUID().replaceAll("-", "")
	const definitions = new Map<string, string>()
	const reviewPackage = prepareLaPazReviewPackage()
	const preparedIds: string[] = []
	let ruleCount = 0
	for (const definition of reviewPackage.definitions) {
		const draft = await createDocumentDefinitionDraft({
			...definition,
			key: `cert.${suffix}.${definition.key}`,
			description: `SYNTHETIC ONLY. ${definition.description}`,
		})
		expect(draft.status).toBe("draft")
		// Publishing a synthetic capture definition does not publish a commercial policy.
		await transitionDocumentDefinition(draft.id, "publish")
		definitions.set(definition.key, draft.id)
	}
	for (const admission of [proposal.admission, proposal.independentGuideAdmission]) {
		const versions: CommercialPolicyVersion[] = []
		const evidence: CommercialEvidence[] = []
		const form = new FormData()
		for (const [key, value] of Object.entries(admission)) {
			if (key === "composition") continue
			if (Array.isArray(value)) for (const item of value) form.append(key, item)
			else form.set(key, String(value))
		}
		form.set("policyCode", `cert_${suffix}_${admission.executionModes[0]}`)
		form.set("effectiveFrom", "2026-11-08")
		form.set("contractMode", "composable")
		form.set("policyKind", admission.composition.kind)
		form.set("policyFamily", admission.composition.family)
		for (const family of admission.composition.requiredFamilies)
			form.append("requiredFamilies", family)
		const draft = await createCommercialPolicyDraft(form)
		versions.push(toVersion(draft, admission.holderType, "product", []))
		preparedIds.push(draft.id)
		expect(draft.status).toBe("draft")
		expect(draft.approvedBy).toBeNull()
		const signatures = await db
			.select()
			.from(CommercialPolicyApproval)
			.where(eq(CommercialPolicyApproval.policyVersionId, draft.id))
		expect(signatures).toEqual([])
		const [stored] = await db
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, draft.id))
		expect(stored?.contextJson).toMatchObject({
			contextVersion: 3,
			composition: { kind: "admission", requiredFamilies: admission.composition.requiredFamilies },
			jurisdictionCodes: [proposal.territoryPlaceId],
		})
		const candidates = [
			{
				id: draft.id,
				policySetId: draft.policySetId,
				composition: compositionSchema.parse(
					(draft.contextJson as Record<string, unknown>).composition
				),
			},
		]
		const groups = [
			...admission.composition.requiredFamilies.map((family) => ({ family, role: "product" })),
			{ family: "identity", role: "holder" },
			{ family: "fiscal", role: "tax" },
		]
		for (const group of groups) {
			const familyForm = new FormData()
			for (const [key, value] of form) familyForm.append(key, value)
			familyForm.delete("requiredFamilies")
			familyForm.set("policyCode", `cert_${suffix}_${admission.executionModes[0]}_${group.family}`)
			familyForm.set("jurisdictionRole", group.role)
			familyForm.set("policyKind", "requirements")
			familyForm.set("policyFamily", group.family)
			if (group.role !== "product") familyForm.delete("contractMode")
			const familyDraft = await createCommercialPolicyDraft(familyForm)
			preparedIds.push(familyDraft.id)
			const guide =
				group.family === "operational_resources" ||
				(group.family === "tourism" && admission.holderType === "persona_natural")
			const keys =
				group.family === "tourism"
					? [guide ? "bo.tour.guide_credential" : "bo.tour.operator_authorization"]
					: group.family === "operational_resources"
						? ["bo.tour.guide_credential"]
						: group.family === "regulated_place"
							? reviewPackage.ruleDefinitions.regulated_place
							: group.family === "platform_standards"
								? reviewPackage.ruleDefinitions.platform_standards
					: group.family === "identity"
						? reviewPackage.ruleDefinitions.identity
						: reviewPackage.ruleDefinitions.fiscal
			const rule = new FormData()
			for (const [key, value] of Object.entries({
				versionId: familyDraft.id,
				requirementKey: `cert.${group.role}.${group.family}`,
				domain: "documents",
				evidenceMode: "versioned",
				evidenceSubjectSelector: guide
					? "guides"
					: group.family === "tourism"
						? "operator"
						: "holder",
				evidenceScope: ["identity", "fiscal"].includes(group.family) ? "provider" : "product",
				reviewOwner: "Titular del proyecto (propuesta)",
				blockingAction: `Completar revision de ${group.family}; no concede permisos ni acredita hechos reales.`,
				sourceKind: "fastt_policy",
				sourceReference: reviewPackage.sourceReference,
				sourceCheckedAt: "2026-11-08",
			}))
				rule.set(key, value)
			for (const capability of ["publish", "booking"]) rule.append("capabilities", capability)
			for (const key of keys) rule.append("alternative.0", definitions.get(key)!)
			await addCommercialPolicyDraftRule(rule)
			const [saved] = await db
				.select()
				.from(ComplianceRequirementRule)
				.where(eq(ComplianceRequirementRule.policyVersionId, familyDraft.id))
			expect(saved?.required).toBe(true)
			expect(saved?.sourceReference).toBe(reviewPackage.sourceReference)
			expect(
				documentAcceptanceSchema.parse(saved?.acceptedEvidenceJson).alternatives[0]?.allOf
			).toHaveLength(keys.length)
			expect(saved?.conditionJson).toMatchObject({
				evidenceSubjectSelector: guide
					? "guides"
					: group.family === "tourism"
						? "operator"
						: "holder",
			})
			versions.push(
				toVersion(familyDraft, admission.holderType, group.role, [parsePolicyRequirement(saved!)])
			)
			for (const key of keys)
				evidence.push({
					id: `${familyDraft.id}:${key}`,
					definitionVersionId: definitions.get(key)!,
					type: "synthetic",
					status: "verified",
					subjectType: guide ? "person" : "provider",
					subjectReference: guide ? "synthetic-guide" : "synthetic-provider",
					expiresAt: new Date("2027-01-01"),
					scopes: ["identity", "fiscal"].includes(group.family)
						? []
						: [{ scopeType: "product", productId: "synthetic-tour" }],
				})
			ruleCount++
			if (group.role === "product")
				candidates.push({
					id: familyDraft.id,
					policySetId: familyDraft.policySetId,
					composition: compositionSchema.parse(
						(familyDraft.contextJson as Record<string, unknown>).composition
					),
				})
		}
		const coverage = composePolicyVersions(candidates)
		expect(coverage.conflicts).toEqual([])
		expect(coverage.missingFamilies).toEqual([])
		for (const family of admission.composition.requiredFamilies) {
			const partial = composePolicyVersions(
				candidates.filter(
					(candidate) =>
						candidate.composition.kind === "admission" || candidate.composition.family !== family
				)
			)
			expect(partial.missingFamilies).toContain(family)
		}
		const team = admission.executionModes[0] === "team"
		const context: CommercialPolicyContext = {
			providerId: "synthetic-provider",
			productId: "synthetic-tour",
			holderType: admission.holderType as "entidad" | "persona_natural",
			legalFormCode: admission.legalFormCodes[0],
			holderCountry: "BO",
			taxCountry: "BO",
			payoutCountry: null,
			productCountry: "BO",
			vertical: "tour",
			collectionModel: "property_collect",
			experienceFormat: "guided_tour",
			operatingRole: team ? "operator" : "guide",
			activityClasses: ["urban_cultural"],
			jurisdictionCodes: [proposal.territoryPlaceId],
			territoryAncestors: {
				"geo:bo:la-paz-city": ["geo:bo:la-paz-city", proposal.territoryPlaceId, "geo:bo"],
				"geo:bo:el-alto": ["geo:bo:el-alto", proposal.territoryPlaceId, "geo:bo"],
			},
			evidenceSubjects: {
				holder: ["synthetic-provider"],
				operator: ["synthetic-provider"],
				guides: ["synthetic-guide"],
			},
			subjectReferences: ["synthetic-provider", "synthetic-guide"],
			operation: {
				version: 2,
				executionMode: team ? "team" : "self",
				guidingService: true,
				characteristics: ["urban_cultural"],
				operatorResourceId: null,
				waterActivity: false,
				airActivity: false,
				foodHandling: "none",
				transportServices: [],
				resourceIds: [],
			},
		}
		const now = new Date("2026-11-08T12:00:00Z")
		expect(
			evaluateCommercialPolicy({ context, versions, evidence, now }).capabilities.publish
		).toBe(false)
		// These approvals are virtual inputs, never saved or presented as real ratification.
		const simulated = versions.map((version) => ({
			...version,
			status: "published" as const,
			approvedBy: "simulation-only",
			approvedAt: now,
			approvalReference: "SIMULATION ONLY",
			signatures: (["policy", "finance", "tour_operations"] as const).map((approvalArea) => ({
				approvalArea,
				approverUserId: "simulation-only",
				approvalReference: "SIMULATION ONLY",
				approvedAt: now,
			})),
		}))
		const ready = evaluateCommercialPolicy({ context, versions: simulated, evidence, now })
		expect(ready.blockers).toEqual([])
		expect(ready.capabilities).toMatchObject({ publish: true, booking: true })
		expect(ready.capabilityStates.collect_payment).toBe("not_applicable")
		expect(ready.capabilityStates.payout).toBe("not_applicable")
		for (const jurisdictionCodes of [["geo:bo:la-paz-city"], ["geo:bo:el-alto"]])
			expect(
				evaluateCommercialPolicy({
					context: { ...context, jurisdictionCodes },
					versions: simulated,
					evidence,
					now,
				}).capabilities.publish
			).toBe(true)
		for (const jurisdictionCodes of [
			["geo:bo:potosi"],
			[proposal.territoryPlaceId, "geo:bo:potosi"],
			["geo:cl:santiago"],
		])
			expect(
				evaluateCommercialPolicy({
					context: { ...context, jurisdictionCodes },
					versions: simulated,
					evidence,
					now,
				}).capabilities.publish
			).toBe(false)
		for (const changed of [
			{ ...context, legalFormCode: null },
			{ ...context, activityClasses: ["urban_cultural", "adventure"] },
			{ ...context, evidenceSubjects: { ...context.evidenceSubjects, guides: [] } },
		])
			expect(
				evaluateCommercialPolicy({ context: changed, versions: simulated, evidence, now })
					.capabilities.booking
			).toBe(false)
		for (const invalid of [
			[],
			evidence.map((item) => ({ ...item, expiresAt: new Date("2000-01-01") })),
			evidence.map((item) => ({ ...item, status: "rejected" as const })),
		])
			expect(
				evaluateCommercialPolicy({ context, versions: simulated, evidence: invalid, now })
					.capabilities.publish
			).toBe(false)
		expect(
			evaluateCommercialPolicy({
				context,
				versions: simulated.map((v) => ({ ...v, signatures: [] })),
				evidence,
				now,
			}).capabilities.publish
		).toBe(false)
		expect(
			evaluateCommercialPolicy({
				context,
				versions: simulated.map((v) => ({ ...v, effectiveFrom: new Date("2027-01-01") })),
				evidence,
				now,
			}).capabilities.publish
		).toBe(false)
	}
	expect(preparedIds).toHaveLength(18)
	expect(ruleCount).toBe(16)
	expect(definitions.size).toBe(7)
	for (const id of preparedIds) {
		const [version] = await db
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, id))
		expect(version?.status).toBe("draft")
		expect(
			await db
				.select()
				.from(CommercialPolicyApproval)
				.where(eq(CommercialPolicyApproval.policyVersionId, id))
		).toEqual([])
	}
})

function toVersion(
	draft: Awaited<ReturnType<typeof createCommercialPolicyDraft>>,
	holderType: string,
	role: string,
	requirements: CommercialPolicyVersion["requirements"]
): CommercialPolicyVersion {
	return {
		id: draft.id,
		policySetId: draft.policySetId,
		jurisdictionRole: role as CommercialPolicyVersion["jurisdictionRole"],
		country: "BO",
		vertical: "tour",
		holderType: holderType as "entidad" | "persona_natural",
		collectionModel: "property_collect",
		status: "draft",
		effectiveFrom: draft.effectiveFrom,
		effectiveTo: draft.effectiveTo,
		approvedBy: null,
		approvedAt: null,
		approvalReference: null,
		signatures: [],
		context: normalizeContextSelector(draft.contextJson),
		requirements,
	}
}
