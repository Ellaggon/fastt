import type { HouseRule, HouseRuleType } from "./houseRule"

export type EffectiveHouseRuleSource = "inherited" | "override"

export type EffectiveHouseRule = HouseRule & {
	source: EffectiveHouseRuleSource
}

function sortEffective(left: EffectiveHouseRule, right: EffectiveHouseRule) {
	if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt)
	if (left.type !== right.type) return left.type.localeCompare(right.type)
	return left.id.localeCompare(right.id)
}

export function resolveEffectiveHouseRules(params: {
	productRules: HouseRule[]
	variantRules?: HouseRule[]
}): EffectiveHouseRule[] {
	const byType = new Map<HouseRuleType, EffectiveHouseRule>()
	for (const rule of params.productRules ?? []) {
		byType.set(rule.type, { ...rule, source: "inherited" })
	}
	for (const rule of params.variantRules ?? []) {
		byType.set(rule.type, { ...rule, source: "override" })
	}
	return [...byType.values()].sort(sortEffective)
}
