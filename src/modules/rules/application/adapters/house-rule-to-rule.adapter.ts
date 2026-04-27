import type { EffectiveRule } from "../../domain/rule.entities"
import {
	buildEffectiveRule,
	buildRuleAssignment,
	buildRuleGroup,
	buildRuleVersion,
	normalizeRuleCode,
} from "./shared"

type HouseRuleLike = {
	id: string
	productId: string
	type: string
	description: string
	createdAt: string
}

export function mapHouseRulesToRules(params: {
	houseRules: HouseRuleLike[]
	now?: Date
}): EffectiveRule[] {
	const nowIso = (params.now ?? new Date()).toISOString()
	const rows = Array.isArray(params.houseRules) ? params.houseRules : []
	const mapped: EffectiveRule[] = []

	for (const row of rows) {
		const ruleType = String(row.type ?? "Other")
		const code = normalizeRuleCode(ruleType)
		const group = buildRuleGroup({ code, category: ruleType || "Other", nowIso })
		const version = buildRuleVersion({
			id: `rule_version:house_rule:${String(row.id)}`,
			groupId: group.id,
			version: 1,
			status: "active",
			effectiveFrom: null,
			effectiveTo: null,
			createdAtIso: String(row.createdAt || nowIso),
			contentJson: {
				kind: "informative",
				description: String(row.description ?? "").trim(),
				rules: {
					type: ruleType,
					rawDescription: String(row.description ?? "").trim(),
				},
				source: "house_rule",
				confidence: "high",
			},
		})
		const assignment = buildRuleAssignment({
			id: `rule_assignment:house_rule:${String(row.id)}`,
			groupId: group.id,
			scope: "product",
			scopeId: String(row.productId ?? "").trim(),
			channel: null,
			createdAtIso: String(row.createdAt || nowIso),
		})
		mapped.push(
			buildEffectiveRule({
				group,
				version,
				assignment,
				source: "house_rule",
				resolvedFromScope: "product",
			})
		)
	}

	return mapped
}
