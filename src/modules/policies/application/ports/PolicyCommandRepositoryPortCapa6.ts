import type { PolicyCategory } from "../../domain/policy.category"

export type CancellationTierInput = {
	daysBeforeArrival: number
	penaltyType: "percentage" | "nights"
	penaltyAmount: number
}

export interface PolicyCommandRepositoryPortCapa6 {
	getPolicyById(policyId: string): Promise<{
		id: string
		groupId: string
		category: PolicyCategory
		status: string
		version: number
		effectiveFrom: string | null
		effectiveTo: string | null
	} | null>

	getPolicyGroupById(groupId: string): Promise<{ id: string; category: PolicyCategory } | null>

	getMaxPolicyVersionByGroupId(groupId: string): Promise<number>

	createPolicyGroup(params: { category: PolicyCategory }): Promise<{ groupId: string }>

	createPolicyVersion(params: {
		groupId: string
		description: string
		version: number
		status: "active"
		effectiveFromIso?: string | null
		effectiveToIso?: string | null
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
		eventType: "policy_version_created" | "assignment_replaced"
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
