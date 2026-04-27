import type { ResolveEffectivePoliciesResult } from "@/modules/policies/public"
import type { EffectiveRule } from "../../domain/rule.entities"
import {
	buildEffectiveRule,
	buildRuleAssignment,
	buildRuleGroup,
	buildRuleVersion,
	normalizeRuleCode,
} from "./shared"

type PolicyRuleRow = {
	ruleKey?: string | null
	ruleValue?: unknown
}

type CancellationTierRow = {
	daysBeforeArrival?: unknown
	penaltyType?: unknown
	penaltyAmount?: unknown
}

function toRulesMap(rows: unknown[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	const list = Array.isArray(rows) ? (rows as PolicyRuleRow[]) : []
	for (const row of list) {
		const key = String(row?.ruleKey ?? "").trim()
		if (!key) continue
		out[key] = row?.ruleValue
	}
	return out
}

function toCancellationTiers(rows: unknown[]): Array<{
	daysBeforeArrival: number
	penaltyType: "percentage" | "nights" | (string & {})
	penaltyAmount: number | null
}> {
	const tiers = Array.isArray(rows) ? (rows as CancellationTierRow[]) : []
	return tiers
		.map((tier) => ({
			daysBeforeArrival: Number(tier?.daysBeforeArrival ?? 0),
			penaltyType: String(tier?.penaltyType ?? "percentage") as
				| "percentage"
				| "nights"
				| (string & {}),
			penaltyAmount:
				tier?.penaltyAmount == null || !Number.isFinite(Number(tier.penaltyAmount))
					? null
					: Number(tier.penaltyAmount),
		}))
		.filter((tier) => Number.isFinite(tier.daysBeforeArrival))
		.sort((a, b) => a.daysBeforeArrival - b.daysBeforeArrival)
}

function toScope(scope: string): "product" | "variant" | "rate_plan" | "global" | "unknown" {
	const normalized = String(scope ?? "")
		.trim()
		.toLowerCase()
	if (normalized === "product") return "product"
	if (normalized === "variant") return "variant"
	if (normalized === "rate_plan" || normalized === "rateplan" || normalized === "rate-plan") {
		return "rate_plan"
	}
	if (normalized === "global") return "global"
	return "unknown"
}

export function mapResolvedPoliciesToRules(params: {
	resolved: ResolveEffectivePoliciesResult
	context: {
		productId: string
		variantId?: string
		ratePlanId?: string
		channel?: string | null
	}
	now?: Date
}): EffectiveRule[] {
	const nowIso = (params.now ?? new Date()).toISOString()
	const productId = String(params.context.productId ?? "").trim()
	const variantId = String(params.context.variantId ?? "").trim()
	const ratePlanId = String(params.context.ratePlanId ?? "").trim()
	const channel = params.context.channel == null ? null : String(params.context.channel)

	const items = Array.isArray(params.resolved?.policies) ? params.resolved.policies : []
	const mapped: EffectiveRule[] = []

	for (const item of items) {
		const rawCategory = String(item?.category ?? "")
		const code = normalizeRuleCode(rawCategory)
		const group = buildRuleGroup({ code, category: rawCategory || "Other", nowIso })
		const rulesMap = toRulesMap(Array.isArray(item.policy?.rules) ? item.policy.rules : [])
		const tiers = toCancellationTiers(
			Array.isArray(item.policy?.cancellationTiers) ? item.policy.cancellationTiers : []
		)

		const contentJson =
			code === "cancellation"
				? {
						kind: "cancellation" as const,
						description: String(item.policy?.description ?? "").trim(),
						tiers,
						rules: rulesMap,
					}
				: code === "payment"
					? {
							kind: "payment" as const,
							description: String(item.policy?.description ?? "").trim(),
							rules: rulesMap,
						}
					: code === "no_show"
						? {
								kind: "no_show" as const,
								description: String(item.policy?.description ?? "").trim(),
								rules: rulesMap,
							}
						: code === "check_in" || code === "check_out"
							? {
									kind: "check_in" as const,
									description: String(item.policy?.description ?? "").trim(),
									rules: rulesMap,
								}
							: {
									kind: "informative" as const,
									description: String(item.policy?.description ?? "").trim(),
									rules: rulesMap,
									source: "policy" as const,
									confidence: "medium" as const,
								}

		const version = buildRuleVersion({
			id: String(item.policy?.id ?? `rule_version:${group.code}:na`),
			groupId: group.id,
			version: Math.max(1, Number(item.policy?.version ?? 1)),
			status: String(item.policy?.status ?? "active") === "inactive" ? "inactive" : "active",
			effectiveFrom: item.policy?.effectiveFrom == null ? null : String(item.policy.effectiveFrom),
			effectiveTo: item.policy?.effectiveTo == null ? null : String(item.policy.effectiveTo),
			createdAtIso: nowIso,
			contentJson,
		})

		const resolvedScope = toScope(String(item.resolvedFromScope ?? "unknown"))
		const assignment =
			resolvedScope === "product"
				? buildRuleAssignment({
						id: `rule_assignment:policy:${version.id}:product:${productId}`,
						groupId: group.id,
						scope: "product",
						scopeId: productId,
						channel,
						createdAtIso: nowIso,
					})
				: resolvedScope === "variant" && variantId
					? buildRuleAssignment({
							id: `rule_assignment:policy:${version.id}:variant:${variantId}`,
							groupId: group.id,
							scope: "variant",
							scopeId: variantId,
							channel,
							createdAtIso: nowIso,
						})
					: resolvedScope === "rate_plan" && ratePlanId
						? buildRuleAssignment({
								id: `rule_assignment:policy:${version.id}:rate_plan:${ratePlanId}`,
								groupId: group.id,
								scope: "rate_plan",
								scopeId: ratePlanId,
								channel,
								createdAtIso: nowIso,
							})
						: null

		mapped.push(
			buildEffectiveRule({
				group,
				version,
				assignment,
				source: "policy",
				resolvedFromScope: resolvedScope,
			})
		)
	}

	return mapped
}
