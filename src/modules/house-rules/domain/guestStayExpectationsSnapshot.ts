import {
	buildHouseRuleGuestSummary,
	normalizeHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleType,
} from "./houseRule"

export type GuestStayExpectationSnapshotRule = {
	id: string
	type: HouseRuleType
	payloadJson: HouseRulePayload
	summary: string
	source: "house_rule"
	createdAt: string
}

export type GuestStayExpectationsSnapshot = {
	productId: string
	source: "house_rule"
	capturedAt: string
	version: string
	rules: GuestStayExpectationSnapshotRule[]
}

export type GuestStayExpectationsSnapshotInputRule = {
	id: string
	type: string
	payloadJson?: Partial<HouseRulePayload> | Record<string, unknown> | null
	createdAt?: string | Date | null
}

function toIso(value: string | Date | null | undefined, fallback: string): string {
	if (value instanceof Date) return value.toISOString()
	const raw = String(value ?? "").trim()
	if (!raw) return fallback
	const parsed = new Date(raw)
	return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString()
}

function snapshotVersion(productId: string, rules: GuestStayExpectationSnapshotRule[]) {
	const signature = rules
		.map((rule) => `${rule.id}:${rule.type}:${rule.summary}:${rule.createdAt}`)
		.join("|")
	let hash = 0
	for (const char of `${productId}|${signature}`) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	}
	return `house_rule_snapshot:v1:${hash.toString(36)}`
}

export function buildGuestStayExpectationsSnapshot(params: {
	productId: string
	rules: GuestStayExpectationsSnapshotInputRule[]
	capturedAt?: Date
}): GuestStayExpectationsSnapshot {
	const capturedAt = (params.capturedAt ?? new Date()).toISOString()
	const productId = String(params.productId ?? "").trim()
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
				source: "house_rule" as const,
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
		source: "house_rule",
		capturedAt,
		version: snapshotVersion(productId, rules),
		rules,
	}
}
