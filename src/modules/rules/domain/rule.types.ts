export type RuleLayer = "HARD" | "CONTRACT" | "INFO"

export type RuleScope = "product" | "variant" | "rate_plan"

export type RuleCapabilities = {
	affectsSearch: boolean
	affectsAvailability: boolean
	requiresAcceptance: boolean
	includedInSnapshot: boolean
	informationalOnly: boolean
}

export type KnownRuleCode =
	| "cancellation"
	| "payment"
	| "no_show"
	| "check_in"
	| "check_out"
	| "pets"
	| "smoking"
	| "children"
	| "extra_beds"
	| "access"
	| "min_stay"
	| "stop_sell"
	| "other"

export type RuleCode = KnownRuleCode | (string & {})

export type CancellationTierContent = {
	daysBeforeArrival: number
	penaltyType: "percentage" | "nights" | (string & {})
	penaltyAmount: number | null
}

export type CancellationRuleContent = {
	kind: "cancellation"
	description: string
	tiers: CancellationTierContent[]
	rules: Record<string, unknown>
}

export type PaymentRuleContent = {
	kind: "payment"
	description: string
	rules: Record<string, unknown>
}

export type NoShowRuleContent = {
	kind: "no_show"
	description: string
	rules: Record<string, unknown>
}

export type CheckInRuleContent = {
	kind: "check_in"
	description: string
	rules: Record<string, unknown>
}

export type HardConstraintRuleContent = {
	kind: "hard_constraint"
	description: string
	rules: Record<string, unknown>
}

export type InformativeRuleContent = {
	kind: "informative"
	description: string
	rules: Record<string, unknown>
	source: "house_rule" | "product_content_rules" | "policy"
	confidence: "high" | "medium" | "low"
}

export type GenericRuleContent = {
	kind: "generic"
	description: string
	rules: Record<string, unknown>
}

export type RuleContent =
	| CancellationRuleContent
	| PaymentRuleContent
	| NoShowRuleContent
	| CheckInRuleContent
	| HardConstraintRuleContent
	| InformativeRuleContent
	| GenericRuleContent
