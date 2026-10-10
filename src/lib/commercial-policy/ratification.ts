import { type ExperienceFormat } from "@/shared/domain/experience-format"
import {
	and,
	db,
	eq,
	sql,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	CommercialPolicyApproval,
} from "@/shared/infrastructure/db/compat"
import {
	tourPolicyPublicationErrors,
	hasRequiredTourApprovals,
	type CommercialPolicyApproval as CommercialPolicyApprovalRecord,
	type CommercialPolicyApprovalArea,
	type CommercialPolicyRequirement,
	type CommercialPolicyVersion,
} from "./evaluate"

export class CommercialPolicyRatificationError extends Error {
	constructor(
		readonly code:
			| "commercial_policy_not_found"
			| "commercial_policy_not_tour"
			| "commercial_policy_not_draft"
			| "commercial_policy_approval_exists"
			| "commercial_policy_not_publishable",
		readonly details: { errors?: string[] } = {}
	) {
		super(code)
	}
}

function array(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: []
}

function condition(value: unknown): CommercialPolicyRequirement["condition"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const source = value as Record<string, unknown>
	const result = {
		operatingRoles: array(source.operatingRoles),
		activityClasses: array(source.activityClasses),
		jurisdictionCodes: array(source.jurisdictionCodes),
		resourceIds: array(source.resourceIds),
		subjectReferences: array(source.subjectReferences),
		evidenceScope: ["provider", "product", "operation"].includes(String(source.evidenceScope))
			? (String(source.evidenceScope) as "provider" | "product" | "operation")
			: undefined,
	}
	return Object.values(result).some((item) => (Array.isArray(item) ? item.length : Boolean(item)))
		? result
		: null
}

function selector(value: unknown): CommercialPolicyVersion["context"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const source = value as Record<string, unknown>
	const result = {
		contextVersion: source.contextVersion === undefined ? undefined : Number(source.contextVersion),
		experienceFormats: array(source.experienceFormats) as ExperienceFormat[],
		operatingRoles: array(source.operatingRoles),
		activityClasses: array(source.activityClasses),
		jurisdictionCodes: array(source.jurisdictionCodes),
	}
	return result.operatingRoles.length &&
		result.activityClasses.length &&
		result.jurisdictionCodes.length
		? result
		: null
}

async function loadVersion(versionId: string): Promise<CommercialPolicyVersion | null> {
	const version = await db
		.select({
			id: CompliancePolicyVersion.id,
			status: CompliancePolicyVersion.status,
			effectiveFrom: CompliancePolicyVersion.effectiveFrom,
			effectiveTo: CompliancePolicyVersion.effectiveTo,
			approvedBy: CompliancePolicyVersion.approvedBy,
			approvedAt: CompliancePolicyVersion.approvedAt,
			approvalReference: CompliancePolicyVersion.approvalReference,
			contextJson: CompliancePolicyVersion.contextJson,
			country: CompliancePolicySet.country,
			vertical: CompliancePolicySet.vertical,
			collectionModel: CompliancePolicySet.collectionModel,
			holderType: CompliancePolicySet.holderType,
			jurisdictionRole: CompliancePolicySet.jurisdictionRole,
		})
		.from(CompliancePolicyVersion)
		.innerJoin(CompliancePolicySet, eq(CompliancePolicyVersion.policySetId, CompliancePolicySet.id))
		.where(
			and(
				eq(CompliancePolicyVersion.id, versionId),
				eq(CompliancePolicySet.policyScope, "commercial")
			)
		)
		.then((rows) => rows[0] ?? null)
	if (!version) return null
	const [rules, approvals] = await Promise.all([
		db
			.select({
				requirementKey: ComplianceRequirementRule.requirementKey,
				required: ComplianceRequirementRule.required,
				capabilitiesJson: ComplianceRequirementRule.capabilitiesJson,
				acceptedEvidenceJson: ComplianceRequirementRule.acceptedEvidenceJson,
				conditionJson: ComplianceRequirementRule.conditionJson,
				blockingAction: ComplianceRequirementRule.blockingAction,
				reviewOwner: ComplianceRequirementRule.reviewOwner,
				sourceKind: ComplianceRequirementRule.sourceKind,
				sourceReference: ComplianceRequirementRule.sourceReference,
				sourceCheckedAt: ComplianceRequirementRule.sourceCheckedAt,
			})
			.from(ComplianceRequirementRule)
			.where(eq(ComplianceRequirementRule.policyVersionId, versionId)),
		db
			.select({
				approvalArea: CommercialPolicyApproval.approvalArea,
				approverUserId: CommercialPolicyApproval.approverUserId,
				approvalReference: CommercialPolicyApproval.approvalReference,
				approvedAt: CommercialPolicyApproval.approvedAt,
			})
			.from(CommercialPolicyApproval)
			.where(eq(CommercialPolicyApproval.policyVersionId, versionId)),
	])
	return {
		id: version.id,
		status: version.status as CommercialPolicyVersion["status"],
		effectiveFrom: version.effectiveFrom,
		effectiveTo: version.effectiveTo,
		approvedBy: version.approvedBy,
		approvedAt: version.approvedAt,
		approvalReference: version.approvalReference,
		context: selector(version.contextJson),
		signatures: approvals.map(
			(row): CommercialPolicyApprovalRecord => ({
				approvalArea: row.approvalArea as CommercialPolicyApprovalRecord["approvalArea"],
				approverUserId: row.approverUserId,
				approvalReference: row.approvalReference,
				approvedAt: row.approvedAt,
			})
		),
		country: version.country,
		vertical: version.vertical as CommercialPolicyVersion["vertical"],
		collectionModel: version.collectionModel as CommercialPolicyVersion["collectionModel"],
		holderType: version.holderType as CommercialPolicyVersion["holderType"],
		jurisdictionRole: version.jurisdictionRole as CommercialPolicyVersion["jurisdictionRole"],
		requirements: rules.map((rule) => ({
			key: rule.requirementKey,
			required: rule.required,
			capabilities: array(rule.capabilitiesJson) as CommercialPolicyRequirement["capabilities"],
			acceptedEvidence: array(rule.acceptedEvidenceJson),
			blockingAction: rule.blockingAction ?? "",
			reviewOwner: rule.reviewOwner ?? "",
			sourceKind: ["legal", "contract", "fastt_policy"].includes(String(rule.sourceKind))
				? (rule.sourceKind as CommercialPolicyRequirement["sourceKind"])
				: null,
			sourceReference: rule.sourceReference,
			sourceCheckedAt: rule.sourceCheckedAt,
			condition: condition(rule.conditionJson),
		})),
	}
}

/** Records one immutable area signature and publishes only after the full contract is signed. */
export async function ratifyCommercialTourPolicy(params: {
	policyVersionId: string
	approvalArea: CommercialPolicyApprovalArea
	approverUserId: string
	approvalReference: string
	approvedAt?: Date
}) {
	return db.transaction(async (tx) => {
		// Serialise ratifications per version. Without this lock, two different
		// final-area approvals could both observe only two signatures and leave the
		// version stranded in draft after committing.
		await tx.execute(
			sql`SELECT "id" FROM "CompliancePolicyVersion" WHERE "id" = ${params.policyVersionId} FOR UPDATE`
		)
		const version = await loadVersion(params.policyVersionId)
		if (!version) throw new CommercialPolicyRatificationError("commercial_policy_not_found")
		if (version.vertical !== "tour")
			throw new CommercialPolicyRatificationError("commercial_policy_not_tour")
		if (version.status !== "draft")
			throw new CommercialPolicyRatificationError("commercial_policy_not_draft")
		if (
			version.signatures.some(
				(signature) =>
					signature.approvalArea === params.approvalArea ||
					signature.approverUserId === params.approverUserId
			)
		) {
			throw new CommercialPolicyRatificationError("commercial_policy_approval_exists")
		}
		const submittedApprovalReference = params.approvalReference.trim()
		if (!submittedApprovalReference)
			throw new CommercialPolicyRatificationError("commercial_policy_not_publishable")
		const approval: CommercialPolicyApprovalRecord = {
			approvalArea: params.approvalArea,
			approverUserId: params.approverUserId,
			approvalReference: submittedApprovalReference,
			approvedAt: params.approvedAt ?? new Date(),
		}
		const nextSignatures = [...version.signatures, approval]
		const publish = hasRequiredTourApprovals({ ...version, signatures: nextSignatures })
		// The version-level record is a traceable bundle of the three area decisions;
		// it is derived from their submitted references, never supplied by the API.
		const approvalReference = publish
			? nextSignatures
					.sort((left, right) => left.approvalArea.localeCompare(right.approvalArea))
					.map((signature) => `${signature.approvalArea}=${signature.approvalReference}`)
					.join("; ")
			: version.approvalReference
		const nextVersion = {
			...version,
			signatures: nextSignatures,
			approvedBy: publish ? approval.approverUserId : version.approvedBy,
			approvedAt: publish ? approval.approvedAt : version.approvedAt,
			approvalReference,
		}
		const errors = tourPolicyPublicationErrors(nextVersion).filter(
			(error) =>
				error !== "tour_policy_signatures_incomplete" &&
				(publish || error !== "tour_policy_approval_metadata_missing")
		)
		if (errors.length)
			throw new CommercialPolicyRatificationError("commercial_policy_not_publishable", { errors })
		await tx.insert(CommercialPolicyApproval).values({
			id: crypto.randomUUID(),
			policyVersionId: params.policyVersionId,
			approvalArea: approval.approvalArea,
			approverUserId: approval.approverUserId,
			approvalReference: approval.approvalReference,
			approvedAt: approval.approvedAt,
		})
		if (publish) {
			await tx
				.update(CompliancePolicyVersion)
				.set({
					status: "published",
					approvedBy: approval.approverUserId,
					approvedAt: approval.approvedAt,
					approvalReference,
				})
				.where(
					and(
						eq(CompliancePolicyVersion.id, params.policyVersionId),
						eq(CompliancePolicyVersion.status, "draft")
					)
				)
		}
		return {
			policyVersionId: params.policyVersionId,
			status: publish ? ("published" as const) : ("draft" as const),
		}
	})
}
