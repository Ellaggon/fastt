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
} from "@/shared/infrastructure/db/compat"
import { EXPERIENCE_FORMATS } from "@/shared/domain/experience-format"
import {
	tourComplianceActivityClasses,
	tourOperatingRoles,
} from "@/lib/tours/tour-compliance-context"
import { tourOperatingTerritories } from "@/lib/tours/tour-operating-territories"
const draftSchema = z
	.object({
		country: z.string().regex(/^[A-Z]{2}$/),
		jurisdictionRole: z.enum(["holder", "product", "tax"]),
		holderType: z.enum(["persona_natural", "entidad"]),
		effectiveFrom: z.iso.date(),
		effectiveTo: z.iso.date(),
		operatingRoles: z.array(z.enum(tourOperatingRoles)).min(1),
		activityClasses: z.array(z.enum(tourComplianceActivityClasses)).min(1),
		experienceFormats: z.array(z.enum(EXPERIENCE_FORMATS)).min(1),
		jurisdictionCodes: z
			.array(
				z
					.string()
					.refine((value) => tourOperatingTerritories.some((territory) => territory.code === value))
			)
			.min(1),
	})
	.refine((value) => value.effectiveFrom <= value.effectiveTo)
const ruleSchema = z.object({
	versionId: z.string().min(1),
	requirementKey: z.string().regex(/^[a-z][a-z0-9_.]{2,100}$/),
	domain: z.enum(["verification", "fiscal", "documents"]),
	evidence: z.enum([
		"government_id",
		"business_registration",
		"tax_document",
		"operating_license",
		"insurance",
	]),
	evidenceScope: z.enum(["provider", "product", "operation"]),
	reviewOwner: z.string().min(3).max(100),
	blockingAction: z.string().min(10).max(1000),
	sourceKind: z.enum(["legal", "contract", "fastt_policy"]),
	sourceReference: z.string().min(8).max(1000),
	sourceCheckedAt: z.iso.date(),
	capabilities: z.array(z.enum(["publish", "booking", "integrations"])).min(1),
})
export async function createCommercialPolicyDraft(form: FormData) {
	const value = draftSchema.parse({
		...Object.fromEntries(form),
		...Object.fromEntries(
			["operatingRoles", "activityClasses", "experienceFormats", "jurisdictionCodes"].map((key) => [
				key,
				form.getAll(key),
			])
		),
	})
	return db.transaction(async (tx) => {
		const key = `tour:${value.country}:${value.holderType}:property_collect:${value.jurisdictionRole}`
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
				effectiveTo: new Date(`${value.effectiveTo}T23:59:59Z`),
				contextJson: {
					contextVersion: 2,
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
	const value = ruleSchema.parse({
		...Object.fromEntries(form),
		capabilities: form.getAll("capabilities"),
	})
	return db.transaction(async (tx) => {
		const [version] = await tx
			.select()
			.from(CompliancePolicyVersion)
			.where(eq(CompliancePolicyVersion.id, value.versionId))
			.for("update")
		if (!version || version.status !== "draft") throw new Error("policy_not_editable")
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
		await tx.insert(ComplianceRequirementRule).values({
			id: crypto.randomUUID(),
			policyVersionId: version.id,
			requirementKey: value.requirementKey,
			domain: value.domain,
			acceptedEvidenceJson: [value.evidence],
			conditionJson: { evidenceScope: value.evidenceScope },
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
