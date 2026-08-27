import {
	buildHouseRuleGuestSummary,
	normalizeHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleType,
} from "./houseRule"
import type { EffectiveHouseRuleSource } from "./effectiveHouseRules"

export type GuestStayExpectationSnapshotRule = {
	id: string
	type: HouseRuleType
	payloadJson: HouseRulePayload
	summary: string
	source: EffectiveHouseRuleSource
	createdAt: string
}

export type GuestStayExpectationsSnapshot = {
	productId: string
	variantId: string | null
	source: "house_rule"
	capturedAt: string
	version: string
	rules: GuestStayExpectationSnapshotRule[]
}

export type GuestStayExpectationsSnapshotInputRule = {
	id: string
	type: string
	payloadJson?: Partial<HouseRulePayload> | Record<string, unknown> | null
	source?: EffectiveHouseRuleSource | "house_rule" | null
	createdAt?: string | Date | null
}

function toIso(value: string | Date | null | undefined, fallback: string): string {
	if (value instanceof Date) return value.toISOString()
	const raw = String(value ?? "").trim()
	if (!raw) return fallback
	const parsed = new Date(raw)
	return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString()
}

function ruleSource(
	value: GuestStayExpectationsSnapshotInputRule["source"]
): EffectiveHouseRuleSource {
	return value === "override" ? "override" : "inherited"
}

function snapshotVersion(
	productId: string,
	variantId: string | null,
	rules: GuestStayExpectationSnapshotRule[]
) {
	const signature = rules
		.map((rule) => `${rule.id}:${rule.type}:${rule.source}:${rule.summary}:${rule.createdAt}`)
		.join("|")
	let hash = 0
	for (const char of `${productId}|${variantId ?? ""}|${signature}`) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	}
	return `house_rule_snapshot:v2:${hash.toString(36)}`
}

export function buildGuestStayExpectationsSnapshot(params: {
	productId: string
	variantId?: string | null
	rules: GuestStayExpectationsSnapshotInputRule[]
	capturedAt?: Date
}): GuestStayExpectationsSnapshot {
	const capturedAt = (params.capturedAt ?? new Date()).toISOString()
	const productId = String(params.productId ?? "").trim()
	const variantId = String(params.variantId ?? "").trim() || null
	const rules = (Array.isArray(params.rules) ? params.rules : [])
		.map((rule) => {
			const type = String(rule.type ?? "Other") as HouseRuleType
			const payloadJson = normalizeHouseRulePayload(type, rule.payloadJson)
			const summary = buildHouseRuleGuestSummary(type, payloadJson).trim()
			if (!summary) return null
			return {
				id: String(rule.id ?? "").trim(),
				type,
				payloadJson,
				summary,
				source: ruleSource(rule.source),
				createdAt: toIso(rule.createdAt, capturedAt),
			}
		})
		.filter((rule): rule is GuestStayExpectationSnapshotRule => Boolean(rule?.id))
		.sort((a, b) => {
			if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt)
			if (a.type !== b.type) return a.type.localeCompare(b.type)
			return a.id.localeCompare(b.id)
		})

	return {
		productId,
		variantId,
		source: "house_rule",
		capturedAt,
		version: snapshotVersion(productId, variantId, rules),
		rules,
	}
}
