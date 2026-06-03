export const POLICY_EXCEPTION_RULE_TYPES = [
	"major_disruptive_event",
	"rebooking_refund",
	"host_cancellation",
	"local_law",
	"support_manual_override",
] as const

export type PolicyExceptionRuleType = (typeof POLICY_EXCEPTION_RULE_TYPES)[number]

export type PolicyExceptionRuleAction = {
	refundOverridePercent?: number | null
	payoutOverrideBasis?: string | null
	payoutOverridePercent?: number | null
	waiveNoShowCharge?: boolean | null
	forceRefundBasis?: string | null
	note?: string | null
}

export type PolicyExceptionRule = {
	id: string
	type: PolicyExceptionRuleType
	scope?: string | null
	scopeId?: string | null
	category?: string | null
	priority?: number | null
	isActive?: boolean | null
	effectiveFrom?: string | null
	effectiveTo?: string | null
	reason?: string | null
	action: PolicyExceptionRuleAction
	createdAt?: Date | string | null
	createdBy?: string | null
}

export type AppliedPolicyExceptionRule = {
	id: string
	type: PolicyExceptionRuleType
	reason: string | null
	action: PolicyExceptionRuleAction
	priority: number
	source: "PolicyExceptionRule"
}

export type PolicyExceptionRuleContext = {
	category: string
	asOfDate?: string | Date | null
	scope?: string | null
	scopeId?: string | null
}

const TYPE_PRIORITY: Record<PolicyExceptionRuleType, number> = {
	major_disruptive_event: 10,
	local_law: 20,
	host_cancellation: 30,
	rebooking_refund: 40,
	support_manual_override: 50,
}

export function isPolicyExceptionRuleType(value: unknown): value is PolicyExceptionRuleType {
	return POLICY_EXCEPTION_RULE_TYPES.includes(value as PolicyExceptionRuleType)
}

function normalizeCategory(value: unknown): string {
	return String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
}

function dateTime(value: string | Date | null | undefined): number | null {
	if (value == null || value === "") return null
	const date = value instanceof Date ? value : new Date(String(value))
	const time = date.getTime()
	return Number.isFinite(time) ? time : null
}

function matchesScope(rule: PolicyExceptionRule, context: PolicyExceptionRuleContext): boolean {
	const ruleScope = String(rule.scope ?? "global").trim()
	const ruleScopeId = rule.scopeId == null ? null : String(rule.scopeId).trim()
	if (!ruleScope || ruleScope === "global") return true
	if (ruleScope !== String(context.scope ?? "").trim()) return false
	if (!ruleScopeId) return true
	return ruleScopeId === String(context.scopeId ?? "").trim()
}

function isEffective(rule: PolicyExceptionRule, asOfDate?: string | Date | null): boolean {
	const asOf = dateTime(asOfDate) ?? Date.now()
	const from = dateTime(rule.effectiveFrom)
	const to = dateTime(rule.effectiveTo)
	return (from == null || from <= asOf) && (to == null || to >= asOf)
}

export function resolvePolicyExceptionOverrides(
	rules: PolicyExceptionRule[] | null | undefined,
	context: PolicyExceptionRuleContext
): AppliedPolicyExceptionRule[] {
	const category = normalizeCategory(context.category)
	return (Array.isArray(rules) ? rules : [])
		.filter((rule) => rule.isActive !== false)
		.filter((rule) => isPolicyExceptionRuleType(rule.type))
		.filter((rule) => {
			const ruleCategory = normalizeCategory(rule.category)
			return !ruleCategory || ruleCategory === category
		})
		.filter((rule) => matchesScope(rule, context))
		.filter((rule) => isEffective(rule, context.asOfDate))
		.sort((a, b) => {
			const priorityDiff = Number(a.priority ?? 100) - Number(b.priority ?? 100)
			if (priorityDiff !== 0) return priorityDiff
			return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
		})
		.map((rule) => ({
			id: String(rule.id),
			type: rule.type,
			reason: rule.reason == null ? null : String(rule.reason),
			action: rule.action ?? {},
			priority: Number(rule.priority ?? 100),
			source: "PolicyExceptionRule" as const,
		}))
}

export function primaryPolicyExceptionOverride(
	rules: PolicyExceptionRule[] | null | undefined,
	context: PolicyExceptionRuleContext
): AppliedPolicyExceptionRule | null {
	return resolvePolicyExceptionOverrides(rules, context)[0] ?? null
}
