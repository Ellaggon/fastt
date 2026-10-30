import { z } from "zod"
import {
	db,
	eq,
	and,
	sql,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	CommercialPolicyApproval,
	DocumentDefinitionVersion,
	inArray,
} from "@/shared/infrastructure/db/compat"
import { EXPERIENCE_FORMATS } from "@/shared/domain/experience-format"
import {
	tourComplianceActivityClasses,
	tourOperatingRoles,
} from "@/lib/tours/tour-compliance-context"
import { assertOperatingPlaces } from "@/lib/tours/operating-geography"
import { legalForms } from "@/shared/domain/legal-forms"
import { executionModes } from "@/shared/domain/tour-operation"
import { compositionSchema } from "./composition"
import { parseEvidenceAlternatives } from "./evidence-alternatives"
export const commercialPolicyDraftSchema = z
	.object({
		composition: compositionSchema.optional(),
		policyCode: z
			.string()
			.regex(/^[a-z][a-z0-9_-]{0,80}$/)
			.default("base"),
		country: z.string().regex(/^[A-Z]{2}$/),
		jurisdictionRole: z.enum(["holder", "product", "tax"]),
		holderType: z.enum(["persona_natural", "entidad"]),
		legalFormCodes: z.array(z.string()).default([]),
		executionModes: z.array(z.enum(executionModes)).default([]),
		foodHandlingModes: z.array(z.enum(["none", "visit", "serve", "prepare"])).default([]),
		transportProviders: z.array(z.enum(["business", "external"])).default([]),
		effectiveFrom: z.iso.date(),
		effectiveTo: z.iso.date().nullable(),
		operatingRoles: z.array(z.enum(tourOperatingRoles)).min(1),
		activityClasses: z
			.array(z.enum(tourComplianceActivityClasses))
			.min(1)
			.refine((values) => !values.includes("water_air"), "Sépara actividades acuáticas y aéreas."),
		experienceFormats: z.array(z.enum(EXPERIENCE_FORMATS)).min(1),
		jurisdictionCodes: z.array(z.string().min(1).max(200)).min(1).max(100),
	})
	.refine((value) => value.effectiveTo === null || value.effectiveFrom <= value.effectiveTo)
	.refine(
		(value) =>
			value.legalFormCodes.every((code) =>
				legalForms.some(
					(form) =>
						form.code === code &&
						form.country === value.country &&
						form.holderType === value.holderType
				)
			),
		"La forma jurídica no corresponde al titular y país."
	)
const ruleSchema = z.object({
	evidenceSubjectSelector: z.enum(["holder", "guides", "operator", "resources"]).optional(),
	versionId: z.string().min(1),
	requirementKey: z.string().regex(/^[a-z][a-z0-9_.]{2,100}$/),
	domain: z.enum(["verification", "fiscal", "documents"]),
	evidence: z
		.enum([
			"government_id",
			"business_registration",
			"tax_document",
			"operating_license",
			"insurance",
		])
		.optional(),
	evidenceScope: z.enum(["provider", "product", "operation"]),
	reviewOwner: z.string().min(3).max(100),
	blockingAction: z.string().min(10).max(1000),
	sourceKind: z.enum(["legal", "contract", "fastt_policy"]),
	sourceReference: z.string().min(8).max(1000),
	sourceCheckedAt: z.iso.date(),
	capabilities: z.array(z.enum(["publish", "booking", "integrations"])).min(1),
})
export async function createCommercialPolicyDraft(form: FormData) {
	const value = commercialPolicyDraftSchema.parse({
		...Object.fromEntries(form),
		composition:
			form.get("contractMode") === "composable"
				? {
						kind: form.get("policyKind"),
						family: form.get("policyFamily"),
						requiredFamilies: form.getAll("requiredFamilies"),
						replacesVersionIds: form.getAll("replacesVersionIds"),
					}
				: undefined,
		effectiveFrom:
			form.get("startMode") === "now"
				? new Date().toISOString().slice(0, 10)
				: form.get("effectiveFrom"),
		effectiveTo: form.get("effectiveTo") || null,
		...Object.fromEntries(
			[
				"operatingRoles",
				"activityClasses",
				"experienceFormats",
				"jurisdictionCodes",
				"legalFormCodes",
				"executionModes",
				"foodHandlingModes",
				"transportProviders",
			].map((key) => [key, form.getAll(key)])
		),
	})
	return db.transaction(async (tx) => {
		await assertOperatingPlaces(value.jurisdictionCodes, value.country)
		if (value.composition?.replacesVersionIds.length) {
			for (const id of value.composition.replacesVersionIds) {
				const [target] = await tx
					.select({ version: CompliancePolicyVersion, set: CompliancePolicySet })
					.from(CompliancePolicyVersion)
					.innerJoin(
						CompliancePolicySet,
						eq(CompliancePolicySet.id, CompliancePolicyVersion.policySetId)
					)
					.where(eq(CompliancePolicyVersion.id, id))
					.for("share")
				const context = target?.version.contextJson as { composition?: unknown } | null
				const parsed = compositionSchema.safeParse(context?.composition)
				if (
					!target ||
					target.version.status !== "published" ||
					target.set.country !== value.country ||
					target.set.holderType !== value.holderType ||
					target.set.jurisdictionRole !== value.jurisdictionRole ||
					target.set.vertical !== "tour" ||
					target.set.collectionModel !== "property_collect" ||
					!parsed.success ||
					parsed.data.family !== value.composition.family ||
					parsed.data.kind !== value.composition.kind
				)
					throw new Error("invalid_policy_replacement")
			}
		}
		const baseKey = `tour:${value.country}:${value.holderType}:property_collect:${value.jurisdictionRole}`
		const key = value.composition
			? `${baseKey}:${value.composition.kind}:${value.composition.family}:${value.policyCode}`
			: baseKey
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
		await tx
			.insert(CompliancePolicySet)
			.values({
				id: crypto.randomUUID(),
				key,
				label: `Tours ${value.country} · ${{ holder: "Titular", product: "Experiencia", tax: "Fiscalidad" }[value.jurisdictionRole]} · ${value.holderType === "entidad" ? "Entidad" : "Persona natural"}`,
				country: value.country,
				holderType: value.holderType,
				vertical: "tour",
				collectionModel: "property_collect",
				jurisdictionRole: value.jurisdictionRole,
				policyScope: "commercial",
			})
			.onConflictDoNothing({ target: CompliancePolicySet.key })
		const [set] = await tx
			.select()
			.from(CompliancePolicySet)
			.where(eq(CompliancePolicySet.key, key))
		const versions = await tx
			.select({ version: CompliancePolicyVersion.version })
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.policySetId, set.id))
		const [row] = await tx
			.insert(CompliancePolicyVersion)
			.values({
				id: crypto.randomUUID(),
				policySetId: set.id,
				version: Math.max(0, ...versions.map((row) => row.version)) + 1,
				effectiveFrom: new Date(`${value.effectiveFrom}T00:00:00Z`),
				effectiveTo: value.effectiveTo ? new Date(`${value.effectiveTo}T23:59:59Z`) : null,
				contextJson: {
					contextVersion: value.composition ? 3 : 2,
					...(value.composition ? { composition: value.composition } : {}),
					legalFormCodes: value.legalFormCodes,
					executionModes: value.executionModes,
					foodHandlingModes: value.foodHandlingModes,
					transportProviders: value.transportProviders,
					operatingRoles: value.operatingRoles,
					activityClasses: value.activityClasses,
					jurisdictionCodes: value.jurisdictionCodes,
					experienceFormats: value.experienceFormats,
				},
			})
			.returning()
		return row
	})
}
export async function addCommercialPolicyDraftRule(form: FormData) {
	const acceptance =
		form.get("evidenceMode") === "versioned" ? parseEvidenceAlternatives(form) : null
	const value = ruleSchema.parse({
		...Object.fromEntries(form),
		evidence: acceptance ? undefined : form.get("evidence"),
		evidenceSubjectSelector: acceptance ? form.get("evidenceSubjectSelector") : undefined,
		capabilities: form.getAll("capabilities"),
	})
	if (!acceptance) z.string().min(1).parse(value.evidence)
	return db.transaction(async (tx) => {
		const [version] = await tx
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, value.versionId))
			.for("update")
		if (!version || version.status !== "draft") throw new Error("policy_not_editable")
		if (
			(version.contextJson as Record<string, unknown> | null)?.contextVersion === 3 &&
			!acceptance
		)
			throw new Error("versioned_policy_evidence_required")
		const signatures = await tx
			.select({ id: CommercialPolicyApproval.id })
			.from(CommercialPolicyApproval)
			.where(eq(CommercialPolicyApproval.policyVersionId, version.id))
		if (signatures.length) throw new Error("signed_policy_immutable")
		const [set] = await tx
			.select()
			.from(CompliancePolicySet)
			.where(
				and(
					eq(CompliancePolicySet.id, version.policySetId),
					eq(CompliancePolicySet.policyScope, "commercial"),
					eq(CompliancePolicySet.vertical, "tour")
				)
			)
		if (!set) throw new Error("policy_not_editable")
		if (acceptance) {
			if (!value.evidenceSubjectSelector) throw new Error("policy_evidence_subject_required")
			const ids = [
				...new Set(
					acceptance.alternatives.flatMap((alternative) =>
						alternative.allOf.map((part) => part.definitionVersionId)
					)
				),
			]
			const definitions = await tx
				.select({ id: DocumentDefinitionVersion.id })
				.from(DocumentDefinitionVersion)
				.where(
					and(
						inArray(DocumentDefinitionVersion.id, ids),
						eq(DocumentDefinitionVersion.status, "published")
					)
				)
				.for("share")
			if (definitions.length !== ids.length)
				throw new Error("policy_evidence_definition_not_published")
		}
		await tx.insert(ComplianceRequirementRule).values({
			id: crypto.randomUUID(),
			policyVersionId: version.id,
			requirementKey: value.requirementKey,
			domain: value.domain,
			acceptedEvidenceJson: acceptance ?? [value.evidence],
			conditionJson: {
				evidenceScope: value.evidenceScope,
				...(acceptance ? { evidenceSubjectSelector: value.evidenceSubjectSelector } : {}),
			},
			capabilitiesJson: value.capabilities,
			reviewOwner: value.reviewOwner,
			blockingAction: value.blockingAction,
			sourceKind: value.sourceKind,
			sourceReference: value.sourceReference,
			sourceCheckedAt: new Date(`${value.sourceCheckedAt}T00:00:00Z`),
		})
	})
}

export async function removeCommercialPolicyDraftRule(versionId: string, ruleId: string) {
	return db.transaction(async (tx) => {
		const [version] = await tx
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, versionId))
			.for("update")
		const signatures = await tx
			.select({ id: CommercialPolicyApproval.id })
			.from(CommercialPolicyApproval)
			.where(eq(CommercialPolicyApproval.policyVersionId, versionId))
		if (!version || version.status !== "draft" || signatures.length)
			throw new Error("signed_policy_immutable")
		const [set] = await tx
			.select()
			.from(CompliancePolicySet)
			.where(
				and(
					eq(CompliancePolicySet.id, version.policySetId),
					eq(CompliancePolicySet.policyScope, "commercial"),
					eq(CompliancePolicySet.vertical, "tour")
				)
			)
		if (!set) throw new Error("policy_not_editable")
		await tx
			.delete(ComplianceRequirementRule)
			.where(
				and(
					eq(ComplianceRequirementRule.id, ruleId),
					eq(ComplianceRequirementRule.policyVersionId, versionId)
				)
			)
	})
}
export async function retireCommercialTourPolicy(versionId: string) {
	return db.transaction(async (tx) => {
		const [version] = await tx
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, versionId))
			.for("update")
		if (!version || version.status !== "published") throw new Error("policy_not_published")
		const [set] = await tx
			.select()
			.from(CompliancePolicySet)
			.where(
				and(
					eq(CompliancePolicySet.id, version.policySetId),
					eq(CompliancePolicySet.policyScope, "commercial"),
					eq(CompliancePolicySet.vertical, "tour")
				)
			)
		if (!set) throw new Error("policy_not_editable")
		await tx
			.update(CompliancePolicyVersion)
			.set({ status: "retired" })
			.where(eq(CompliancePolicyVersion.id, versionId))
	})
}
