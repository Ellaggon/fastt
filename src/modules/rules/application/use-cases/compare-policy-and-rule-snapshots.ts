type PolicyItemSnapshot = {
	description?: string
	rules?: unknown[]
	cancellationTiers?: unknown[]
}

type PolicySnapshotLike = {
	cancellation?: PolicyItemSnapshot | null
	payment?: PolicyItemSnapshot | null
	no_show?: PolicyItemSnapshot | null
	check_in?: PolicyItemSnapshot | null
}

type RuleContractTerm = {
	category?: string
	content?: unknown
}

type RuleSnapshotLike = {
	contractTerms?: RuleContractTerm[]
}

export type SnapshotMismatch = {
	category: "cancellation" | "payment" | "no_show" | "check_in"
	type: "missing" | "value_mismatch" | "structure_mismatch"
	details: string
}

export type SnapshotComparisonResult = {
	isConsistent: boolean
	mismatches: SnapshotMismatch[]
}

function normalizeCategory(
	value: string
): "cancellation" | "payment" | "no_show" | "check_in" | null {
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

function extractRulesMap(rows: unknown[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	const list = Array.isArray(rows) ? rows : []
	for (const row of list) {
		if (!row || typeof row !== "object") continue
		const key = String((row as any).ruleKey ?? "").trim()
		if (!key) continue
		out[key] = (row as any).ruleValue
	}
	return out
}

function stableJson(value: unknown): string {
	const visit = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map((item) => visit(item))
		if (input && typeof input === "object") {
			const obj = input as Record<string, unknown>
			const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b))
			const out: Record<string, unknown> = {}
			for (const key of keys) out[key] = visit(obj[key])
			return out
		}
		return input
	}
	return JSON.stringify(visit(value))
}

function contentRulesMap(content: unknown): Record<string, unknown> | null {
	if (!content || typeof content !== "object") return null
	const rules = (content as any).rules
	if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null
	return rules as Record<string, unknown>
}

function contentCancellationTiers(content: unknown): unknown[] | null {
	if (!content || typeof content !== "object") return null
	const tiers = (content as any).tiers
	if (!Array.isArray(tiers)) return null
	return tiers
}

type NormalizedCancellationTier = {
	daysBeforeArrival: number
	penaltyType: string
	penaltyAmount: number | null
}

function normalizeCancellationTiers(rows: unknown[]): NormalizedCancellationTier[] {
	return rows
		.map((row) => {
			if (!row || typeof row !== "object") return null
			const source = row as Record<string, unknown>
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
			return {
				daysBeforeArrival,
				penaltyType,
				penaltyAmount,
			}
		})
		.filter((row): row is NormalizedCancellationTier => Boolean(row))
		.sort((a, b) => {
			if (a.daysBeforeArrival !== b.daysBeforeArrival) {
				return a.daysBeforeArrival - b.daysBeforeArrival
			}
			if (a.penaltyType !== b.penaltyType) return a.penaltyType.localeCompare(b.penaltyType)
			const amountA = a.penaltyAmount ?? Number.NEGATIVE_INFINITY
			const amountB = b.penaltyAmount ?? Number.NEGATIVE_INFINITY
			return amountA - amountB
		})
}

function contentDescription(content: unknown): string | null {
	if (!content || typeof content !== "object") return null
	const description = (content as any).description
	return description == null ? null : String(description)
}

function contentKind(content: unknown): string | null {
	if (!content || typeof content !== "object") return null
	const kind = (content as any).kind
	return kind == null ? null : String(kind)
}

export function comparePolicyAndRuleSnapshots(
	policySnapshot: PolicySnapshotLike | null | undefined,
	ruleSnapshot: RuleSnapshotLike | null | undefined
): SnapshotComparisonResult {
	const mismatches: SnapshotMismatch[] = []
	const categories: Array<"cancellation" | "payment" | "no_show" | "check_in"> = [
		"cancellation",
		"payment",
		"no_show",
		"check_in",
	]

	const termsByCategory = new Map<
		"cancellation" | "payment" | "no_show" | "check_in",
		RuleContractTerm
	>()
	const contractTerms = Array.isArray(ruleSnapshot?.contractTerms)
		? ruleSnapshot?.contractTerms
		: []
	for (const term of contractTerms) {
		const category = normalizeCategory(String(term?.category ?? ""))
		if (!category) continue
		if (!termsByCategory.has(category)) termsByCategory.set(category, term)
	}

	for (const category of categories) {
		const policyValue = (policySnapshot as any)?.[category] ?? null
		const ruleTerm = termsByCategory.get(category) ?? null
		const hasPolicy = policyValue != null
		const hasRule = ruleTerm != null

		if (hasPolicy !== hasRule) {
			mismatches.push({
				category,
				type: "missing",
				details: hasPolicy
					? "policy snapshot has category but rule snapshot is missing"
					: "rule snapshot has category but policy snapshot is missing",
			})
			continue
		}

		if (!hasPolicy || !hasRule) continue

		const content = ruleTerm?.content
		const kind = contentKind(content)
		const expectedKind =
			category === "cancellation"
				? "cancellation"
				: category === "payment"
					? "payment"
					: category === "no_show"
						? "no_show"
						: "check_in"
		if (!kind || kind !== expectedKind) {
			mismatches.push({
				category,
				type: "structure_mismatch",
				details: `rule content kind is '${kind ?? "null"}', expected '${expectedKind}'`,
			})
			continue
		}

		const policyDescription = String((policyValue as any)?.description ?? "")
		const ruleDescription = contentDescription(content)
		if (ruleDescription == null) {
			mismatches.push({
				category,
				type: "structure_mismatch",
				details: "rule content is missing description",
			})
			continue
		}
		if (policyDescription !== ruleDescription) {
			mismatches.push({
				category,
				type: "value_mismatch",
				details: "description differs",
			})
		}

		const policyRulesMap = extractRulesMap(
			Array.isArray((policyValue as any)?.rules) ? (policyValue as any).rules : []
		)
		const ruleRulesMap = contentRulesMap(content)
		if (ruleRulesMap == null) {
			mismatches.push({
				category,
				type: "structure_mismatch",
				details: "rule content is missing rules object",
			})
			continue
		}
		if (stableJson(policyRulesMap) !== stableJson(ruleRulesMap)) {
			mismatches.push({
				category,
				type: "value_mismatch",
				details: "rules payload differs",
			})
		}

		if (category === "cancellation") {
			const policyTiers = Array.isArray((policyValue as any)?.cancellationTiers)
				? (policyValue as any).cancellationTiers
				: []
			const ruleTiers = contentCancellationTiers(content)
			if (ruleTiers == null) {
				mismatches.push({
					category,
					type: "structure_mismatch",
					details: "rule content is missing cancellation tiers array",
				})
				continue
			}
			const normalizedPolicyTiers = normalizeCancellationTiers(policyTiers)
			const normalizedRuleTiers = normalizeCancellationTiers(ruleTiers)
			if (stableJson(normalizedPolicyTiers) !== stableJson(normalizedRuleTiers)) {
				mismatches.push({
					category,
					type: "value_mismatch",
					details: "cancellation tiers differ",
				})
			}
		}
	}

	return {
		isConsistent: mismatches.length === 0,
		mismatches,
	}
}
