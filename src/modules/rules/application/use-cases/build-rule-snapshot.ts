import type { RuleContent } from "../../domain/rule.types"
import type { ResolveEffectiveRulesResult } from "./resolve-effective-rules"

export type RuleContractTermSnapshot = {
	ruleId: string
	version: number
	category: string
	content: RuleContent
	source: "policy" | "house_rule" | "product_content_rules"
	timestamp: string
}

export type RuleHardConstraintEvidenceSnapshot = {
	ruleId: string
	version: number
	category: string
	source: "policy" | "house_rule" | "product_content_rules"
	timestamp: string
}

export type RuleSnapshot = {
	contractTerms: RuleContractTermSnapshot[]
	hardConstraintEvidence: RuleHardConstraintEvidenceSnapshot[]
}

export function buildRuleSnapshot(params: {
	resolvedRules: ResolveEffectiveRulesResult
	resolvedAt?: Date
}): RuleSnapshot {
	const resolvedAtIso = (params.resolvedAt ?? new Date()).toISOString()
	const allRules = Array.isArray(params.resolvedRules?.allRules)
		? params.resolvedRules.allRules
		: []

	const contractTerms: RuleContractTermSnapshot[] = allRules
		.filter(
			(rule) =>
				Boolean(rule.group.capabilities.requiresAcceptance) ||
				String(rule.group.layer) === "CONTRACT"
		)
		.map((rule) => ({
			ruleId: String(rule.version.id),
			version: Number(rule.version.version ?? 1),
			category: String(rule.group.category ?? rule.group.code),
			content: rule.version.contentJson,
			source: rule.source,
			timestamp: resolvedAtIso,
		}))

	const hardConstraintEvidence: RuleHardConstraintEvidenceSnapshot[] = allRules
		.filter((rule) => Boolean(rule.group.capabilities.affectsAvailability))
		.map((rule) => ({
			ruleId: String(rule.version.id),
			version: Number(rule.version.version ?? 1),
			category: String(rule.group.category ?? rule.group.code),
			source: rule.source,
			timestamp: resolvedAtIso,
		}))

	const dedupeKey = (row: { ruleId: string; version: number; category: string; source: string }) =>
		`${row.ruleId}:${row.version}:${row.category}:${row.source}`

	const dedupe = <T extends { ruleId: string; version: number; category: string; source: string }>(
		rows: T[]
	): T[] => {
		const seen = new Set<string>()
		const out: T[] = []
		for (const row of rows) {
			const key = dedupeKey(row)
			if (seen.has(key)) continue
			seen.add(key)
			out.push(row)
		}
		return out.sort((a, b) => {
			if (a.category !== b.category) return a.category.localeCompare(b.category)
			if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId)
			if (a.version !== b.version) return a.version - b.version
			return a.source.localeCompare(b.source)
		})
	}

	return {
		contractTerms: dedupe(contractTerms),
		hardConstraintEvidence: dedupe(hardConstraintEvidence),
	}
}
