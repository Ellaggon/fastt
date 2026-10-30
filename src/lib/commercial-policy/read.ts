import { normalizeContextSelector, parsePolicyRequirement } from "./contract-parser"
import { commercialReadOnce } from "./read-scope"
import { readHistoricalTerritoryMap, readTerritoryAncestors } from "@/lib/tours/operating-geography"
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
	type CommercialPolicyVersion,
	type CommercialEvidence,
	type CommercialPolicyApproval as CommercialPolicyApprovalRecord,
} from "./evaluate"

/** Reads only explicitly commercial policies. Legacy casework seeds cannot grant permissions. */
export async function diagnoseCommercialPolicy(params: {
	now?: Date
	context: CommercialPolicyContext
	verifiedEvidence?: string[]
	evidence?: CommercialEvidence[]
}) {
	const key = JSON.stringify([
		params.context.vertical,
		params.context.holderType,
		params.context.collectionModel,
		[
			params.context.holderCountry,
			params.context.productCountry,
			params.context.taxCountry,
			params.context.payoutCountry,
		]
			.filter(Boolean)
			.sort(),
	])
	const rows = await commercialReadOnce(`policies:${key}`, async () =>
		db
			.select({
				id: CompliancePolicyVersion.id,
				policySetId: CompliancePolicyVersion.policySetId,
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
			.innerJoin(
				CompliancePolicySet,
				eq(CompliancePolicyVersion.policySetId, CompliancePolicySet.id)
			)
			.where(
				and(
					inArray(CompliancePolicySet.country, [
						...new Set(
							[
								params.context.holderCountry,
								params.context.productCountry,
								params.context.taxCountry,
								params.context.payoutCountry,
							].filter((country): country is string => Boolean(country))
						),
					]),
					eq(CompliancePolicySet.policyScope, "commercial"),
					eq(CompliancePolicySet.status, "active"),
					eq(CompliancePolicySet.vertical, params.context.vertical),
					eq(CompliancePolicySet.holderType, params.context.holderType),
					eq(CompliancePolicySet.collectionModel, params.context.collectionModel)
				)
			)
	)
	const ids = rows.map((row) => row.id)
	const [rules, approvals] = ids.length
		? await commercialReadOnce(`policy-details:${JSON.stringify([...ids].sort())}`, () =>
				Promise.all([
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
			)
		: [[], []]
	const versions: CommercialPolicyVersion[] = rows.map((row) => ({
		id: row.id,
		policySetId: row.policySetId,
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
			.map(parsePolicyRequirement),
	}))
	const [historical, territoryAncestors] = await Promise.all([
		commercialReadOnce("historical-territories", () => readHistoricalTerritoryMap()),
		commercialReadOnce(
			`ancestors:${JSON.stringify(params.context.jurisdictionCodes ?? params.context.jurisdictionCode)}`,
			() =>
				readTerritoryAncestors(
					params.context.jurisdictionCodes ??
						(params.context.jurisdictionCode ? [params.context.jurisdictionCode] : [])
				)
		),
	])
	for (const version of versions) {
		if (version.context?.jurisdictionCodes)
			version.context.jurisdictionCodes = version.context.jurisdictionCodes.map(
				(id) => historical[id] ?? id
			)
		for (const rule of version.requirements) {
			if (rule.condition?.jurisdictionCodes)
				rule.condition.jurisdictionCodes = rule.condition.jurisdictionCodes.map(
					(id) => historical[id] ?? id
				)
		}
	}
	return evaluateCommercialPolicy({
		now: params.now,
		context: { ...params.context, territoryAncestors },
		versions,
		verifiedEvidence: params.verifiedEvidence,
		evidence: params.evidence,
	})
}
