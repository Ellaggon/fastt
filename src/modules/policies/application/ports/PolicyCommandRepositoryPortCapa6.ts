import type { PolicyCategory } from "../../domain/policy.category"
import type { CancellationTierInput } from "../schemas/policy-write/policyContentSchema"

export type { CancellationTierInput } from "../schemas/policy-write/policyContentSchema"

export type PolicyLibraryStatus = "draft" | "active" | "archived"
export type PolicyProfessionalMetadata = {
	policyPresetKey?: string | null
	stayLengthType?: string | null
	gracePeriod?: number | null
	refundBasis?: string | null
	payoutBasis?: string | null
	localTimezone?: string | null
}

export interface PolicyCommandRepositoryPortCapa6 {
	getPolicyById(policyId: string): Promise<
		| ({
				id: string
				groupId: string
				category: PolicyCategory
				status: string
				version: number
				effectiveFrom: string | null
				effectiveTo: string | null
		  } & PolicyProfessionalMetadata)
		| null
	>

	getPolicyGroupById(
		groupId: string
	): Promise<{ id: string; category: PolicyCategory; ownerProviderId: string } | null>

	getMaxPolicyVersionByGroupId(groupId: string): Promise<number>

	createPolicyGroup(params: {
		category: PolicyCategory
		ownerProviderId: string
	}): Promise<{ groupId: string }>

	createPolicyVersion(params: {
		groupId: string
		description: string
		version: number
		status: PolicyLibraryStatus
		effectiveFrom?: string | null
		effectiveTo?: string | null
		metadata?: PolicyProfessionalMetadata
	}): Promise<{ policyId: string }>

	replacePolicyRules(params: {
		policyId: string
		rules: Array<{ ruleKey: string; ruleValue: unknown }>
	}): Promise<void>

	replaceCancellationTiers(params: {
		policyId: string
		tiers: CancellationTierInput[]
	}): Promise<void>

	listActivePoliciesByGroupId(groupId: string): Promise<
		Array<{
			id: string
			version: number
			effectiveFrom: string | null
			effectiveTo: string | null
		}>
	>

	createAuditLog(params: {
		eventType:
			| "policy_created"
			| "policy_version_created"
			| "assignment_replaced"
			| "assignment_created"
			| "policy_exception_created"
			| "policy_exception_updated"
			| "policy_exception_approved"
			| "policy_exception_rejected"
			| "policy_exception_rolled_back"
			| "policy_override_resolved"
			| "policy_snapshot_created"
		actorUserId?: string | null
		policyId?: string | null
		policyGroupId?: string | null
		assignmentId?: string | null
		scope?: string | null
		scopeId?: string | null
		channel?: string | null
		before?: unknown
		after?: unknown
	}): Promise<void>
}
