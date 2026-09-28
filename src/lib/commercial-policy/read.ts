import {
	and,
	db,
	eq,
	inArray,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	CommercialPolicyApproval,
} from "@/shared/infrastructure/db/compat"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyContext,
	type CommercialPolicyRequirement,
	type CommercialPolicyVersion,
	type CommercialCapability,
	type CommercialEvidence,
	type CommercialPolicyContextSelector,
	type CommercialPolicyApproval as CommercialPolicyApprovalRecord,
} from "./evaluate"

const capabilityValues: CommercialCapability[] = [
	"publish",
	"booking",
	"collect_payment",
	"payout",
	"integrations",
]

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: []
}

function normalizeRequirementCondition(value: unknown): CommercialPolicyRequirement["condition"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const raw = value as Record<string, unknown>
	const list = (key: string) => stringArray(raw[key]).slice(0, 50)
	const condition = {
		operatingRoles: list("operatingRoles"),
		activityClasses: list("activityClasses"),
		jurisdictionCodes: list("jurisdictionCodes"),
		resourceIds: list("resourceIds"),
		subjectReferences: list("subjectReferences"),
		evidenceScope: ["provider", "product", "operation"].includes(String(raw.evidenceScope))
			? (String(raw.evidenceScope) as "provider" | "product" | "operation")
			: undefined,
	}
	return Object.values(condition).some((value) =>
		Array.isArray(value) ? value.length > 0 : Boolean(value)
	)
		? condition
		: null
}

function normalizeContextSelector(value: unknown): CommercialPolicyContextSelector | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const raw = value as Record<string, unknown>
	const selector = {
		operatingRoles: stringArray(raw.operatingRoles).slice(0, 12),
		activityClasses: stringArray(raw.activityClasses).slice(0, 12),
		jurisdictionCodes: stringArray(raw.jurisdictionCodes).slice(0, 20),
	}
	return selector.operatingRoles.length &&
		selector.activityClasses.length &&
		selector.jurisdictionCodes.length
		? selector
		: null
}

/** Reads only explicitly commercial policies. Legacy casework seeds cannot grant permissions. */
export async function diagnoseCommercialPolicy(params: {
	context: CommercialPolicyContext
	verifiedEvidence?: string[]
	evidence?: CommercialEvidence[]
}) {
	const rows = await db
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
				eq(CompliancePolicySet.policyScope, "commercial"),
				eq(CompliancePolicySet.status, "active"),
				eq(CompliancePolicySet.vertical, params.context.vertical),
				eq(CompliancePolicySet.holderType, params.context.holderType),
				eq(CompliancePolicySet.collectionModel, params.context.collectionModel)
			)
		)
	const ids = rows.map((row) => row.id)
	const [rules, approvals] = ids.length
		? await Promise.all([
				db
					.select({
						policyVersionId: ComplianceRequirementRule.policyVersionId,
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
					.where(inArray(ComplianceRequirementRule.policyVersionId, ids)),
				db
					.select({
						policyVersionId: CommercialPolicyApproval.policyVersionId,
						approvalArea: CommercialPolicyApproval.approvalArea,
						approverUserId: CommercialPolicyApproval.approverUserId,
						approvalReference: CommercialPolicyApproval.approvalReference,
						approvedAt: CommercialPolicyApproval.approvedAt,
					})
					.from(CommercialPolicyApproval)
					.where(inArray(CommercialPolicyApproval.policyVersionId, ids)),
			])
		: [[], []]
	const versions: CommercialPolicyVersion[] = rows.map((row) => ({
		id: row.id,
		status: row.status as CommercialPolicyVersion["status"],
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo,
		approvedBy: row.approvedBy,
		approvedAt: row.approvedAt,
		approvalReference: row.approvalReference,
		context: normalizeContextSelector(row.contextJson),
		signatures: approvals
			.filter((approval) => approval.policyVersionId === row.id)
			.map(
				(approval): CommercialPolicyApprovalRecord => ({
					approvalArea: approval.approvalArea as CommercialPolicyApprovalRecord["approvalArea"],
					approverUserId: approval.approverUserId,
					approvalReference: approval.approvalReference,
					approvedAt: approval.approvedAt,
				})
			),
		country: row.country,
		vertical: row.vertical as CommercialPolicyVersion["vertical"],
		collectionModel: row.collectionModel as CommercialPolicyVersion["collectionModel"],
		holderType: row.holderType as CommercialPolicyVersion["holderType"],
		jurisdictionRole: row.jurisdictionRole as CommercialPolicyVersion["jurisdictionRole"],
		requirements: rules
			.filter((rule) => rule.policyVersionId === row.id)
			.map((rule): CommercialPolicyRequirement => {
				const capabilities = stringArray(rule.capabilitiesJson).filter(
					(value): value is CommercialCapability =>
						capabilityValues.includes(value as CommercialCapability)
				)
				return {
					key: rule.requirementKey,
					required: rule.required,
					capabilities: capabilities.length ? capabilities : capabilityValues,
					acceptedEvidence: stringArray(rule.acceptedEvidenceJson),
					blockingAction: rule.blockingAction || "Solicita revisión de este requisito.",
					reviewOwner: rule.reviewOwner || "policies",
					sourceKind: ["legal", "contract", "fastt_policy"].includes(String(rule.sourceKind))
						? (rule.sourceKind as CommercialPolicyRequirement["sourceKind"])
						: null,
					sourceReference: rule.sourceReference,
					sourceCheckedAt: rule.sourceCheckedAt,
					condition: normalizeRequirementCondition(rule.conditionJson),
				}
			}),
	}))
	return evaluateCommercialPolicy({
		context: params.context,
		versions,
		verifiedEvidence: params.verifiedEvidence,
		evidence: params.evidence,
	})
}
