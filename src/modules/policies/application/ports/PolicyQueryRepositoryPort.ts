import type { PolicyScope } from "../../domain/policy.scope"

export type ResolvePoliciesParams = {
	productId?: string | null
	variantId?: string | null
	channel?: string | null
	category?: string | null
	arrivalDate?: string | null
	includeCancellation?: boolean
	includeRules?: boolean
}

export type ResolvedPolicyRow = {
	id: string
	groupId: string
	category: string
	description: string
	version: number
	scope: PolicyScope
	scopeId: string
}

export interface PolicyQueryRepositoryPort {
	resolvePolicyRows(params: ResolvePoliciesParams): Promise<ResolvedPolicyRow[]>
	listPolicyRulesByPolicyIds(policyIds: string[]): Promise<any[]>
	listCancellationTiersByPolicyIds(policyIds: string[]): Promise<any[]>

	findAssignment(scope: PolicyScope, scopeId: string, category: string): Promise<any | null>
	findActivePolicy(groupId: string): Promise<any | null>
	findParent(type: string, id: string): Promise<{ type: string; id: string } | null>
	listPolicyRulesByPolicyId(policyId: string): Promise<any[]>
	listCancellationTiersByPolicyId(policyId: string): Promise<any[]>

	getPolicyById(policyId: string): Promise<any | null>
	listAssignedPoliciesByScope(scopeId: string, category?: string | null): Promise<any[]>
	listAssignmentsByGroupId(groupId: string): Promise<any[]>
	listPolicyHistoryByGroupId(groupId: string): Promise<any[]>
}
