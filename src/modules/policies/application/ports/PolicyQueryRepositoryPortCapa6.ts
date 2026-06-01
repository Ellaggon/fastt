import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"

export type PolicyDetailCapa6 = {
	policy: {
		id: string
		groupId: string
		description: string
		version: number
		status: string
		policyPresetKey: string | null
		stayLengthType: string | null
		gracePeriod: number | null
		refundBasis: string | null
		payoutBasis: string | null
		localTimezone: string | null
		legalOverrideFlags: Record<string, boolean> | null
		effectiveFrom: string | null
		effectiveTo: string | null
	}
	group: {
		id: string
		category: PolicyCategory
	}
	rules: Array<{
		id: string
		policyId: string
		ruleKey: string | null
		ruleValue: unknown
	}>
	tiers: Array<{
		id: string
		policyId: string
		daysBeforeArrival: number
		penaltyType: string
		penaltyAmount: number | null
	}>
	assignments: Array<{
		id: string
		policyGroupId: string
		scope: PolicyScope
		scopeId: string
		channel: string | null
		isActive: boolean
	}>
}

export interface PolicyQueryRepositoryPortCapa6 {
	getPolicyDetailById(policyId: string): Promise<PolicyDetailCapa6 | null>
}
