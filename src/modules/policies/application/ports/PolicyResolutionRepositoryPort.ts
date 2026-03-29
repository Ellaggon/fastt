import type { PolicyScope } from "../../domain/policy.scope"

export type ScopeNode = {
	scope: PolicyScope
	scopeId: string
}

export type PolicyAssignmentSnapshot = {
	id: string
	policyGroupId: string
	category: string
	scope: PolicyScope
	scopeId: string
	channel: string | null
}

export type PolicySnapshot = {
	id: string
	groupId: string
	description: string
	version: number
	status: "active"
	effectiveFrom?: string | null
	effectiveTo?: string | null
}

export type PolicyRuleRow = {
	id: string
	policyId: string
	ruleKey: string | null
	ruleValue: unknown
}

export type CancellationTierRow = {
	id: string
	policyId: string
	daysBeforeArrival: number
	penaltyType: string
	penaltyAmount: number | null
}

export interface PolicyResolutionRepositoryPort {
	listActiveAssignments(params: {
		scopeChain: ScopeNode[]
		channels: Array<string | null>
	}): Promise<PolicyAssignmentSnapshot[]>

	/**
	 * Returns at most one policy per groupId (the best active version for the given as-of date).
	 */
	listActivePoliciesByGroupIds(params: {
		groupIds: string[]
		asOfDate: string // YYYY-MM-DD
	}): Promise<Record<string, PolicySnapshot>>

	listPolicyRulesByPolicyId(policyId: string): Promise<PolicyRuleRow[]>
	listCancellationTiersByPolicyId(policyId: string): Promise<CancellationTierRow[]>
}
