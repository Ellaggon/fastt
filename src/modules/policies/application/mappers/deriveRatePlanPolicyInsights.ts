import type { ResolveEffectivePoliciesResult } from "../use-cases/resolve-effective-policies"
import { derivePolicySummaryFromResolvedPolicies } from "./derivePolicySummary"

type SnapshotPolicy = ResolveEffectivePoliciesResult["policies"][number]

type PolicyRule = {
	ruleKey?: string | null
	ruleValue?: unknown
}

type CancellationTier = {
	daysBeforeArrival?: unknown
	penaltyType?: unknown
	penaltyAmount?: unknown
}

export type RatePlanPolicyInsights = {
	summary: string
	highlights: {
		cancellation: string
		payment: string
		noShow: string
	}
	flexibilityScore: number
}

function normalizeCategory(value: string): string {
	return String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
}

function findCategory(
	policies: SnapshotPolicy[],
	predicate: (normalizedCategory: string) => boolean
): SnapshotPolicy | null {
	for (const policy of policies) {
		const normalized = normalizeCategory(String(policy?.category ?? ""))
		if (predicate(normalized)) return policy
	}
	return null
}

function toRuleMap(policy: SnapshotPolicy | null): Record<string, unknown> {
	if (!policy) return {}
	const rules = Array.isArray(policy.policy?.rules) ? (policy.policy.rules as PolicyRule[]) : []
	const out: Record<string, unknown> = {}
	for (const rule of rules) {
		const key = String(rule?.ruleKey ?? "").trim()
		if (!key) continue
		out[key] = rule?.ruleValue
	}
	return out
}

function toCancellationTiers(policy: SnapshotPolicy | null): CancellationTier[] {
	if (!policy) return []
	const tiers = Array.isArray(policy.policy?.cancellationTiers)
		? (policy.policy.cancellationTiers as CancellationTier[])
		: []
	return tiers
		.map((tier) => ({
			daysBeforeArrival: tier?.daysBeforeArrival,
			penaltyType: tier?.penaltyType,
			penaltyAmount: tier?.penaltyAmount,
		}))
		.filter((tier) => Number.isFinite(Number(tier.daysBeforeArrival)))
		.sort((a, b) => Number(b.daysBeforeArrival) - Number(a.daysBeforeArrival))
}

function describeCancellation(policy: SnapshotPolicy | null): { text: string; score: number } {
	if (!policy) return { text: "Cancelación según política", score: 30 }

	const tiers = toCancellationTiers(policy)
	if (!tiers.length) {
		const description = String(policy.policy?.description ?? "").trim()
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

	const freeTier = tiers.find((tier) => {
		const penaltyType = String(tier.penaltyType ?? "").toLowerCase()
		const penaltyAmount = Number(tier.penaltyAmount ?? NaN)
		return penaltyType === "percentage" && Number.isFinite(penaltyAmount) && penaltyAmount <= 0
	})
	if (freeTier) {
		const days = Number(freeTier.daysBeforeArrival ?? 0)
		const score = Math.min(95, 65 + days)
		if (days > 0) {
			return { text: `Cancelación gratis hasta ${days} día${days === 1 ? "" : "s"} antes`, score }
		}
		return { text: "Cancelación gratis", score }
	}

	const strictTier = tiers.find((tier) => {
		const penaltyType = String(tier.penaltyType ?? "").toLowerCase()
		const penaltyAmount = Number(tier.penaltyAmount ?? NaN)
		return penaltyType === "percentage" && Number.isFinite(penaltyAmount) && penaltyAmount >= 100
	})
	if (strictTier) return { text: "No reembolsable", score: 10 }

	const highestPenalty = tiers.reduce((max, tier) => {
		const value = Number(tier.penaltyAmount ?? 0)
		return Number.isFinite(value) ? Math.max(max, value) : max
	}, 0)
	const score = Math.max(20, 70 - Math.round(highestPenalty / 2))
	return { text: "Cancelación con cargo", score }
}

function describePayment(policy: SnapshotPolicy | null): { text: string; score: number } {
	if (!policy) return { text: "Pago según política", score: 35 }

	const rules = toRuleMap(policy)
	const paymentType = String(rules.paymentType ?? "").toLowerCase()
	if (paymentType === "pay_at_property") return { text: "Pago en la propiedad", score: 90 }
	if (paymentType === "prepayment" || paymentType === "prepaid" || paymentType === "prepay") {
		const pct = Number(rules.prepaymentPercentage ?? NaN)
		if (Number.isFinite(pct) && pct > 0) {
			const score = Math.max(20, 85 - Math.round(pct * 0.6))
			return { text: `Prepago ${Math.round(pct)}%`, score }
		}
		return { text: "Prepago requerido", score: 35 }
	}

	const description = String(policy.policy?.description ?? "").trim()
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

function describeNoShow(policy: SnapshotPolicy | null): { text: string; score: number } {
	if (!policy) return { text: "No-show según política", score: 35 }
	const rules = toRuleMap(policy)
	const penaltyType = String(rules.penaltyType ?? "").toLowerCase()
	if (!penaltyType) return { text: "No-show según política", score: 35 }
	if (penaltyType === "first_night") return { text: "No-show: primera noche", score: 60 }
	if (penaltyType === "full") return { text: "No-show: estancia completa", score: 20 }
	if (penaltyType === "percentage") {
		const pct = Number(rules.penaltyAmount ?? NaN)
		if (Number.isFinite(pct)) {
			const score = Math.max(20, 80 - Math.round(pct * 0.6))
			return { text: `No-show: ${Math.round(pct)}%`, score }
		}
	}
	return { text: "No-show según política", score: 35 }
}

export function deriveRatePlanPolicyInsights(
	resolved: ResolveEffectivePoliciesResult
): RatePlanPolicyInsights {
	const policies = Array.isArray(resolved?.policies) ? resolved.policies : []
	const cancellation = findCategory(policies, (category) => category.includes("cancel"))
	const payment = findCategory(policies, (category) => category === "payment")
	const noShow = findCategory(policies, (category) => category === "noshow")

	const cancellationHighlight = describeCancellation(cancellation)
	const paymentHighlight = describePayment(payment)
	const noShowHighlight = describeNoShow(noShow)

	const flexibilityScore = Math.round(
		cancellationHighlight.score * 0.5 + paymentHighlight.score * 0.35 + noShowHighlight.score * 0.15
	)

	return {
		summary: derivePolicySummaryFromResolvedPolicies(resolved),
		highlights: {
			cancellation: cancellationHighlight.text,
			payment: paymentHighlight.text,
			noShow: noShowHighlight.text,
		},
		flexibilityScore,
	}
}
