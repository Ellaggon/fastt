import {
	and,
	db,
	eq,
	inArray,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
} from "@/shared/infrastructure/db/compat"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyContext,
	type CommercialPolicyRequirement,
	type CommercialPolicyVersion,
	type CommercialCapability,
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

/** Reads only explicitly commercial policies. Legacy casework seeds cannot grant permissions. */
export async function diagnoseCommercialPolicy(params: {
	context: CommercialPolicyContext
	verifiedEvidence: string[]
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
	const rules = ids.length
		? await db
				.select({
					policyVersionId: ComplianceRequirementRule.policyVersionId,
					requirementKey: ComplianceRequirementRule.requirementKey,
					required: ComplianceRequirementRule.required,
					capabilitiesJson: ComplianceRequirementRule.capabilitiesJson,
					acceptedEvidenceJson: ComplianceRequirementRule.acceptedEvidenceJson,
					blockingAction: ComplianceRequirementRule.blockingAction,
					reviewOwner: ComplianceRequirementRule.reviewOwner,
				})
				.from(ComplianceRequirementRule)
				.where(inArray(ComplianceRequirementRule.policyVersionId, ids))
		: []
	const versions: CommercialPolicyVersion[] = rows.map((row) => ({
		id: row.id,
		status: row.status as CommercialPolicyVersion["status"],
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo,
		approvedBy: row.approvedBy,
		approvedAt: row.approvedAt,
		approvalReference: row.approvalReference,
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
				}
			}),
	}))
	return evaluateCommercialPolicy({
		context: params.context,
		versions,
		verifiedEvidence: params.verifiedEvidence,
	})
}
