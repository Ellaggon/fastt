import type { RuleCapabilities, RuleCode, RuleContent, RuleLayer, RuleScope } from "./rule.types"

export type RuleGroup = {
	id: string
	code: RuleCode
	category: string
	layer: RuleLayer
	capabilities: RuleCapabilities
	createdAt: string
	updatedAt: string
}

export type RuleVersion = {
	id: string
	groupId: string
	version: number
	status: "active" | "inactive"
	effectiveFrom: string | null
	effectiveTo: string | null
	contentJson: RuleContent
	createdAt: string
}

export type RuleAssignment = {
	id: string
	groupId: string
	scope: RuleScope
	scopeId: string
	channel: string | null
	isActive: boolean
	createdAt: string
}

export type RuleAuditLog = {
	id: string
	ruleGroupId: string
	action: string
	beforeJson: unknown
	afterJson: unknown
	actor: string | null
	createdAt: string
}

export type EffectiveRule = {
	group: RuleGroup
	version: RuleVersion
	assignment: RuleAssignment | null
	source: "policy" | "house_rule" | "product_content_rules"
	resolvedFromScope: RuleScope | "global" | "unknown"
}
