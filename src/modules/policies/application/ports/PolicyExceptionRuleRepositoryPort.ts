import type {
	PolicyExceptionRule,
	PolicyExceptionRuleAction,
} from "../../domain/overrides/policyExceptionRule"

export type PolicyExceptionRuleScope = "global" | "product" | "variant" | "rate_plan"

export type PolicyExceptionRuleCreateInput = {
	type: PolicyExceptionRule["type"]
	scope?: PolicyExceptionRuleScope | null
	scopeId?: string | null
	category?: string | null
	priority?: number | null
	isActive?: boolean | null
	effectiveFrom?: string | null
	effectiveTo?: string | null
	reason?: string | null
	action: PolicyExceptionRuleAction
	createdBy?: string | null
}

export type PolicyExceptionRuleListFilter = {
	scope?: PolicyExceptionRuleScope | "all" | null
	scopeId?: string | null
	category?: string | null
	type?: PolicyExceptionRule["type"] | "all" | null
	isActive?: boolean | "all" | null
	limit?: number | null
}

export type PolicyExceptionRuleContextFilter = {
	productId: string
	variantId?: string | null
	ratePlanId?: string | null
	channel?: string | null
	checkIn?: string | null
	checkOut?: string | null
}

export interface PolicyExceptionRuleRepositoryPort {
	list(filter?: PolicyExceptionRuleListFilter): Promise<PolicyExceptionRule[]>
	listApplicable(ctx: PolicyExceptionRuleContextFilter): Promise<PolicyExceptionRule[]>
	create(input: PolicyExceptionRuleCreateInput): Promise<PolicyExceptionRule>
	setActive(params: {
		id: string
		isActive: boolean
		actorUserId?: string | null
	}): Promise<PolicyExceptionRule | null>
}
