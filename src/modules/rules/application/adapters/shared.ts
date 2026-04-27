import { getRuleCatalogItem } from "../../domain/rule.catalog"
import type {
	EffectiveRule,
	RuleAssignment,
	RuleGroup,
	RuleVersion,
} from "../../domain/rule.entities"
import type { RuleCode } from "../../domain/rule.types"

export function normalizeRuleCode(value: string): RuleCode {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
	if (!normalized) return "other"
	if (normalized.includes("cancel")) return "cancellation"
	if (normalized.includes("payment") || normalized.includes("prepay")) return "payment"
	if (normalized.includes("noshow") || normalized.includes("no_show")) return "no_show"
	if (normalized.includes("checkin") || normalized.includes("check_in")) return "check_in"
	if (normalized.includes("checkout") || normalized.includes("check_out")) return "check_out"
	if (normalized === "noshow") return "no_show"
	if (normalized === "checkin") return "check_in"
	if (normalized === "checkout") return "check_out"
	if (normalized === "extrabeds") return "extra_beds"
	if (normalized === "stopsell") return "stop_sell"
	if (normalized === "minstay") return "min_stay"
	if (normalized === "house_rules" || normalized === "house_rule" || normalized === "houserules") {
		return "other"
	}
	return normalized as RuleCode
}

export function buildRuleGroup(params: {
	code: RuleCode
	category: string
	nowIso: string
}): RuleGroup {
	const catalog = getRuleCatalogItem(params.code)
	return {
		id: `rule_group:${String(catalog.code)}`,
		code: catalog.code,
		category: params.category || catalog.category,
		layer: catalog.layer,
		capabilities: catalog.capabilities,
		createdAt: params.nowIso,
		updatedAt: params.nowIso,
	}
}

export function buildRuleVersion(params: {
	id: string
	groupId: string
	version: number
	status?: "active" | "inactive"
	effectiveFrom?: string | null
	effectiveTo?: string | null
	createdAtIso: string
	contentJson: RuleVersion["contentJson"]
}): RuleVersion {
	return {
		id: params.id,
		groupId: params.groupId,
		version: params.version,
		status: params.status ?? "active",
		effectiveFrom: params.effectiveFrom ?? null,
		effectiveTo: params.effectiveTo ?? null,
		contentJson: params.contentJson,
		createdAt: params.createdAtIso,
	}
}

export function buildRuleAssignment(params: {
	id: string
	groupId: string
	scope: RuleAssignment["scope"]
	scopeId: string
	channel?: string | null
	createdAtIso: string
}): RuleAssignment {
	return {
		id: params.id,
		groupId: params.groupId,
		scope: params.scope,
		scopeId: params.scopeId,
		channel: params.channel ?? null,
		isActive: true,
		createdAt: params.createdAtIso,
	}
}

export function buildEffectiveRule(params: {
	group: RuleGroup
	version: RuleVersion
	assignment: RuleAssignment | null
	source: EffectiveRule["source"]
	resolvedFromScope: EffectiveRule["resolvedFromScope"]
}): EffectiveRule {
	return {
		group: params.group,
		version: params.version,
		assignment: params.assignment,
		source: params.source,
		resolvedFromScope: params.resolvedFromScope,
	}
}
