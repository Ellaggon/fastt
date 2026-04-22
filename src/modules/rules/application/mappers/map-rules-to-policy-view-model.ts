import type { RuleSnapshot } from "../use-cases/build-rule-snapshot"

export type RulePolicyViewModel = {
	cancellationSummary: string
	paymentSummary: string
	noShowSummary: string
	checkInSummary: string
	highlights: string[]
	flexibilityScore: number
}

export type RulePolicyCardView = {
	category: "Cancellation" | "Payment" | "NoShow" | "CheckIn"
	description: string
	version: number
	resolvedFromScope: "rate_plan" | "variant" | "product" | "global"
}

type RuleContractTerm = RuleSnapshot["contractTerms"][number]

function normalizeCategory(
	value: string
): "cancellation" | "payment" | "noshow" | "checkin" | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
	if (normalized.includes("cancel")) return "cancellation"
	if (normalized === "payment") return "payment"
	if (normalized === "noshow") return "noshow"
	if (normalized === "checkin") return "checkin"
	return null
}

function findByCategory(
	terms: RuleContractTerm[],
	target: "cancellation" | "payment" | "noshow" | "checkin"
): RuleContractTerm | null {
	for (const term of terms) {
		const normalized = normalizeCategory(String(term?.category ?? ""))
		if (normalized === target) return term
	}
	return null
}

function contentDescription(content: unknown): string {
	if (!content || typeof content !== "object") return ""
	return String((content as any).description ?? "").trim()
}

function contentRules(content: unknown): Record<string, unknown> {
	if (!content || typeof content !== "object") return {}
	const rules = (content as any).rules
	if (!rules || typeof rules !== "object" || Array.isArray(rules)) return {}
	return rules as Record<string, unknown>
}

function contentCancellationTiers(content: unknown): Array<{
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
			const penaltyType = String(source.penaltyType ?? "percentage").toLowerCase()
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
			): row is { daysBeforeArrival: number; penaltyType: string; penaltyAmount: number | null } =>
				Boolean(row)
		)
		.sort((a, b) => b.daysBeforeArrival - a.daysBeforeArrival)
}

function describeCancellation(term: RuleContractTerm | null): { text: string; score: number } {
	if (!term) return { text: "Cancelación según política", score: 30 }
	const content = term.content
	const tiers = contentCancellationTiers(content)
	if (!tiers.length) {
		const description = contentDescription(content)
		if (!description) return { text: "Cancelación según política", score: 30 }
		const normalized = description.toLowerCase()
		if (normalized.includes("non-refundable") || normalized.includes("no reembolsable")) {
			return { text: "No reembolsable", score: 5 }
		}
		if (normalized.includes("free cancellation") || normalized.includes("cancelación gratuita")) {
			return { text: "Cancelación gratis", score: 90 }
		}
		return { text: "Cancelación con condiciones", score: 45 }
	}
	const freeTier = tiers.find(
		(tier) => tier.penaltyType === "percentage" && (tier.penaltyAmount ?? 0) <= 0
	)
	if (freeTier) {
		const days = Number(freeTier.daysBeforeArrival ?? 0)
		const score = Math.min(95, 65 + days)
		return days > 0
			? { text: `Cancelación gratis hasta ${days} día${days === 1 ? "" : "s"} antes`, score }
			: { text: "Cancelación gratis", score }
	}
	const strictTier = tiers.find(
		(tier) => tier.penaltyType === "percentage" && Number(tier.penaltyAmount ?? NaN) >= 100
	)
	if (strictTier) return { text: "No reembolsable", score: 10 }
	const highestPenalty = tiers.reduce(
		(max, tier) => Math.max(max, Number(tier.penaltyAmount ?? 0)),
		0
	)
	const score = Math.max(20, 70 - Math.round(highestPenalty / 2))
	return { text: "Cancelación con cargo", score }
}

function describePayment(term: RuleContractTerm | null): { text: string; score: number } {
	if (!term) return { text: "Pago según política", score: 35 }
	const rules = contentRules(term.content)
	const paymentType = String(rules.paymentType ?? "").toLowerCase()
	if (paymentType === "pay_at_property") return { text: "Pago en la propiedad", score: 90 }
	if (paymentType === "prepayment" || paymentType === "prepaid" || paymentType === "prepay") {
		const pct = Number(rules.prepaymentPercentage ?? NaN)
		if (Number.isFinite(pct) && pct > 0) {
			return {
				text: `Prepago ${Math.round(pct)}%`,
				score: Math.max(20, 85 - Math.round(pct * 0.6)),
			}
		}
		return { text: "Prepago requerido", score: 35 }
	}
	const description = contentDescription(term.content)
	if (!description) return { text: "Pago según política", score: 35 }
	const normalized = description.toLowerCase()
	if (normalized.includes("pay at property") || normalized.includes("pago en la propiedad")) {
		return { text: "Pago en la propiedad", score: 90 }
	}
	if (normalized.includes("prepayment") || normalized.includes("prepago")) {
		return { text: "Prepago requerido", score: 35 }
	}
	return { text: "Pago según política", score: 35 }
}

function describeNoShow(term: RuleContractTerm | null): { text: string; score: number } {
	if (!term) return { text: "No-show según política", score: 35 }
	const rules = contentRules(term.content)
	const penaltyType = String(rules.penaltyType ?? "").toLowerCase()
	if (!penaltyType) return { text: "No-show según política", score: 35 }
	if (penaltyType === "first_night") return { text: "No-show: primera noche", score: 60 }
	if (penaltyType === "full") return { text: "No-show: estancia completa", score: 20 }
	if (penaltyType === "percentage") {
		const pct = Number(rules.penaltyAmount ?? NaN)
		if (Number.isFinite(pct)) {
			return {
				text: `No-show: ${Math.round(pct)}%`,
				score: Math.max(20, 80 - Math.round(pct * 0.6)),
			}
		}
	}
	return { text: "No-show según política", score: 35 }
}

function describeCheckIn(term: RuleContractTerm | null): string {
	if (!term) return "Check-in según política"
	const rules = contentRules(term.content)
	const from = String(rules.checkInFrom ?? "").trim()
	const until = String(rules.checkInUntil ?? "").trim()
	if (from && until) return `Check-in ${from} - ${until}`
	if (from) return `Check-in desde ${from}`
	const description = contentDescription(term.content)
	return description || "Check-in según política"
}

export function mapRulesToPolicyViewModel(
	ruleSnapshot: RuleSnapshot | null | undefined
): RulePolicyViewModel {
	const terms = Array.isArray(ruleSnapshot?.contractTerms) ? ruleSnapshot.contractTerms : []
	const cancellation = describeCancellation(findByCategory(terms, "cancellation"))
	const payment = describePayment(findByCategory(terms, "payment"))
	const noShow = describeNoShow(findByCategory(terms, "noshow"))
	const checkInSummary = describeCheckIn(findByCategory(terms, "checkin"))
	const flexibilityScore = Math.round(
		cancellation.score * 0.5 + payment.score * 0.35 + noShow.score * 0.15
	)
	return {
		cancellationSummary: cancellation.text,
		paymentSummary: payment.text,
		noShowSummary: noShow.text,
		checkInSummary,
		highlights: [cancellation.text, payment.text, noShow.text],
		flexibilityScore,
	}
}

export function mapRuleSnapshotToPolicyCards(
	ruleSnapshot: RuleSnapshot | null | undefined
): RulePolicyCardView[] {
	const terms = Array.isArray(ruleSnapshot?.contractTerms) ? ruleSnapshot.contractTerms : []
	const byCategory = new Map<string, RuleContractTerm>()
	for (const term of terms) {
		const normalized = normalizeCategory(String(term.category ?? ""))
		if (!normalized) continue
		if (!byCategory.has(normalized)) byCategory.set(normalized, term)
	}
	const mapSourceToScope = (source: string): RulePolicyCardView["resolvedFromScope"] => {
		if (source === "policy") return "rate_plan"
		if (source === "house_rule") return "product"
		if (source === "product_content_rules") return "product"
		return "global"
	}
	const rows: RulePolicyCardView[] = []
	const append = (
		key: "cancellation" | "payment" | "noshow" | "checkin",
		category: RulePolicyCardView["category"]
	) => {
		const term = byCategory.get(key)
		if (!term) return
		rows.push({
			category,
			description: contentDescription(term.content),
			version: Number(term.version ?? 0),
			resolvedFromScope: mapSourceToScope(String(term.source ?? "")),
		})
	}
	append("cancellation", "Cancellation")
	append("payment", "Payment")
	append("checkin", "CheckIn")
	append("noshow", "NoShow")
	return rows
}
