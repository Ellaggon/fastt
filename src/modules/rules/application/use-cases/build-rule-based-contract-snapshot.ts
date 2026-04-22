import type { RuleSnapshot } from "./build-rule-snapshot"

type ContractCategory = "cancellation" | "payment" | "no_show" | "check_in"

export type RuleBasedContractItemSnapshot = {
	category: ContractCategory
	ruleId: string
	version: number
	description: string
	source: "policy" | "house_rule" | "product_content_rules"
	rules: Record<string, unknown>
	cancellationTiers: Array<{
		daysBeforeArrival: number
		penaltyType: string
		penaltyAmount: number | null
	}>
}

export type RuleBasedContractSnapshot = {
	cancellation: RuleBasedContractItemSnapshot | null
	payment: RuleBasedContractItemSnapshot | null
	no_show: RuleBasedContractItemSnapshot | null
	check_in: RuleBasedContractItemSnapshot | null
	meta: {
		resolvedAt: string
		checkIn: string
		checkOut: string
		channel: string | null
	}
}

function normalizeCategory(value: string): ContractCategory | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
	if (normalized.includes("cancel")) return "cancellation"
	if (normalized === "payment") return "payment"
	if (normalized === "noshow") return "no_show"
	if (normalized === "checkin") return "check_in"
	return null
}

function normalizeRules(content: unknown): Record<string, unknown> {
	if (!content || typeof content !== "object") return {}
	const rules = (content as any).rules
	if (!rules || typeof rules !== "object" || Array.isArray(rules)) return {}
	return rules as Record<string, unknown>
}

function normalizeDescription(content: unknown): string {
	if (!content || typeof content !== "object") return ""
	return String((content as any).description ?? "").trim()
}

function normalizeCancellationTiers(content: unknown): Array<{
	daysBeforeArrival: number
	penaltyType: string
	penaltyAmount: number | null
}> {
	if (!content || typeof content !== "object") return []
	const tiers = (content as any).tiers
	if (!Array.isArray(tiers)) return []
	return tiers
		.map((tier) => {
			if (!tier || typeof tier !== "object") return null
			const source = tier as Record<string, unknown>
			const daysBeforeArrival = Number(source.daysBeforeArrival ?? NaN)
			if (!Number.isFinite(daysBeforeArrival)) return null
			const penaltyType = String(source.penaltyType ?? "")
				.trim()
				.toLowerCase()
			const penaltyAmountRaw = source.penaltyAmount
			const penaltyAmount =
				penaltyAmountRaw == null || !Number.isFinite(Number(penaltyAmountRaw))
					? null
					: Number(penaltyAmountRaw)
			return { daysBeforeArrival, penaltyType, penaltyAmount }
		})
		.filter(
			(
				row
			): row is {
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			} => Boolean(row)
		)
		.sort((a, b) => a.daysBeforeArrival - b.daysBeforeArrival)
}

function toContractItem(
	term: RuleSnapshot["contractTerms"][number],
	category: ContractCategory
): RuleBasedContractItemSnapshot {
	return {
		category,
		ruleId: String(term.ruleId),
		version: Number(term.version ?? 0),
		description: normalizeDescription(term.content),
		source: term.source,
		rules: normalizeRules(term.content),
		cancellationTiers: category === "cancellation" ? normalizeCancellationTiers(term.content) : [],
	}
}

export function buildRuleBasedContractSnapshot(params: {
	ruleSnapshot: RuleSnapshot | null | undefined
	checkIn: string
	checkOut: string
	channel?: string | null
	resolvedAt?: Date
}): RuleBasedContractSnapshot {
	const terms = Array.isArray(params.ruleSnapshot?.contractTerms)
		? params.ruleSnapshot.contractTerms
		: []
	const byCategory: Record<ContractCategory, RuleBasedContractItemSnapshot | null> = {
		cancellation: null,
		payment: null,
		no_show: null,
		check_in: null,
	}
	for (const term of terms) {
		const category = normalizeCategory(term.category)
		if (!category) continue
		if (!byCategory[category]) {
			byCategory[category] = toContractItem(term, category)
		}
	}

	return {
		cancellation: byCategory.cancellation,
		payment: byCategory.payment,
		no_show: byCategory.no_show,
		check_in: byCategory.check_in,
		meta: {
			resolvedAt: (params.resolvedAt ?? new Date()).toISOString(),
			checkIn: params.checkIn,
			checkOut: params.checkOut,
			channel: params.channel == null ? null : String(params.channel),
		},
	}
}
