import type { EffectiveRule } from "../../domain/rule.entities"
import { buildEffectiveRule, buildRuleAssignment, buildRuleGroup, buildRuleVersion } from "./shared"

function splitRulesText(raw: string): string[] {
	const trimmed = String(raw ?? "").trim()
	if (!trimmed) return []
	if (trimmed.includes("\n")) {
		return trimmed
			.split(/\r?\n/g)
			.map((line) => line.trim())
			.filter(Boolean)
	}
	if (trimmed.includes(";")) {
		return trimmed
			.split(";")
			.map((line) => line.trim())
			.filter(Boolean)
	}
	if (trimmed.includes(",")) {
		return trimmed
			.split(",")
			.map((line) => line.trim())
			.filter(Boolean)
	}
	return [trimmed]
}

export function mapProductContentRulesToRule(params: {
	productId: string
	rulesText: string | null | undefined
	now?: Date
}): EffectiveRule[] {
	const nowIso = (params.now ?? new Date()).toISOString()
	const productId = String(params.productId ?? "").trim()
	const raw = String(params.rulesText ?? "").trim()
	if (!productId || !raw) return []

	const group = buildRuleGroup({ code: "other", category: "Other", nowIso })
	const versionId = `rule_version:product_content_rules:${productId}`
	const parsedItems = splitRulesText(raw)
	const version = buildRuleVersion({
		id: versionId,
		groupId: group.id,
		version: 1,
		status: "active",
		effectiveFrom: null,
		effectiveTo: null,
		createdAtIso: nowIso,
		contentJson: {
			kind: "informative",
			description: raw,
			rules: {
				items: parsedItems,
				rawText: raw,
			},
			source: "product_content_rules",
			confidence: "low",
		},
	})
	const assignment = buildRuleAssignment({
		id: `rule_assignment:product_content_rules:${productId}`,
		groupId: group.id,
		scope: "product",
		scopeId: productId,
		channel: null,
		createdAtIso: nowIso,
	})

	return [
		buildEffectiveRule({
			group,
			version,
			assignment,
			source: "product_content_rules",
			resolvedFromScope: "product",
		}),
	]
}
