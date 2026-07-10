import type { PolicyResolutionDTO } from "../dto/PolicyResolutionDTO"
import { getPolicyMissingCategoryLabel } from "@/data/policy/policy-categories"
import { getPolicyPresetLabel } from "@/data/policy/policy-presets"

type SnapshotPolicy = PolicyResolutionDTO["policies"][number]

type PolicyRule = {
	ruleKey?: string | null
	ruleValue?: unknown
}

type CancellationTier = {
	daysBeforeArrival?: unknown
	penaltyType?: unknown
	penaltyAmount?: unknown
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

function describeCancellation(policy: SnapshotPolicy | null): string {
	if (!policy) return ""

	const presetKey = String(policy.policy?.policyPresetKey ?? "")
		.trim()
		.toLowerCase()
	const presetLabel = getPolicyPresetLabel(presetKey, "Cancellation", "")
	if (presetLabel)
		return presetLabel === "No reembolsable"
			? presetLabel
			: `Cancelación ${presetLabel.toLowerCase()}`

	const tiers = toCancellationTiers(policy)
	if (!tiers.length) {
		const description = String(policy.policy?.description ?? "").trim()
		if (!description) return "Cancelación configurada"
		const normalized = description.toLowerCase()
		if (normalized.includes("non-refundable") || normalized.includes("no reembolsable")) {
			return "No reembolsable"
		}
		if (normalized.includes("free cancellation") || normalized.includes("cancelación gratuita")) {
			return "Cancelación gratis"
		}
		return "Cancelación con condiciones"
	}

	const freeTier = tiers.find((tier) => {
		const penaltyType = String(tier.penaltyType ?? "").toLowerCase()
		const penaltyAmount = Number(tier.penaltyAmount ?? NaN)
		return penaltyType === "percentage" && Number.isFinite(penaltyAmount) && penaltyAmount <= 0
	})
	if (freeTier) {
		const days = Number(freeTier.daysBeforeArrival ?? 0)
		if (days > 0) return `Cancelación gratis hasta ${days} día${days === 1 ? "" : "s"} antes`
		return "Cancelación gratis hasta el día de llegada"
	}

	const strictTier = tiers.find((tier) => {
		const penaltyType = String(tier.penaltyType ?? "").toLowerCase()
		const penaltyAmount = Number(tier.penaltyAmount ?? NaN)
		return penaltyType === "percentage" && Number.isFinite(penaltyAmount) && penaltyAmount >= 100
	})
	if (strictTier && Number(strictTier.daysBeforeArrival ?? 0) >= 0) {
		return "No reembolsable"
	}

	return "Cancelación con cargo"
}

function describePayment(policy: SnapshotPolicy | null): string {
	if (!policy) return ""

	const rules = toRuleMap(policy)
	const presetKey = String(policy.policy?.policyPresetKey ?? "")
		.trim()
		.toLowerCase()
	const presetLabel = getPolicyPresetLabel(presetKey, "Payment", "")
	if (presetLabel) return presetLabel

	const paymentType = String(rules.paymentType ?? "").toLowerCase()
	if (paymentType === "pay_at_property") return "Paga en la propiedad"
	if (paymentType === "prepayment" || paymentType === "prepaid" || paymentType === "prepay") {
		const pct = Number(rules.prepaymentPercentage ?? NaN)
		if (Number.isFinite(pct) && pct > 0) {
			return `Prepago ${Math.round(pct)}%`
		}
		return "Prepago requerido"
	}

	const description = String(policy.policy?.description ?? "").trim()
	if (!description) return "Pago configurado"
	const normalized = description.toLowerCase()
	if (normalized.includes("pay at property") || normalized.includes("pago en la propiedad")) {
		return "Paga en la propiedad"
	}
	if (normalized.includes("prepayment") || normalized.includes("prepago")) {
		return "Prepago requerido"
	}
	return "Pago según política"
}

function describeNoShow(policy: SnapshotPolicy | null): string {
	if (!policy) return ""

	const presetKey = String(policy.policy?.policyPresetKey ?? "")
		.trim()
		.toLowerCase()
	const presetLabel = getPolicyPresetLabel(presetKey, "NoShow", "")
	if (presetLabel) return presetLabel

	const rules = toRuleMap(policy)
	const penaltyType = String(rules.penaltyType ?? "").toLowerCase()
	const penaltyAmount = Number(rules.penaltyAmount ?? NaN)
	if (penaltyType === "first_night") return "No presentación: primera noche"
	if (penaltyType === "full") return "No presentación: estadía completa"
	if (penaltyType === "percentage" && Number.isFinite(penaltyAmount)) {
		return penaltyAmount >= 100
			? "No presentación configurada"
			: `No presentación ${Math.round(penaltyAmount)}%`
	}

	const description = String(policy.policy?.description ?? "").trim()
	if (!description) return "No presentación configurada"
	return "No presentación configurada"
}

function describeArrival(policy: SnapshotPolicy | null): string {
	if (!policy) return ""

	const presetKey = String(policy.policy?.policyPresetKey ?? "")
		.trim()
		.toLowerCase()
	const presetLabel = getPolicyPresetLabel(presetKey, "CheckIn", "")
	if (presetLabel)
		return presetLabel === "Ingreso estándar" ? "Llegada y salida estándar" : presetLabel
	return "Llegada y salida configuradas"
}

function naturalList(values: string[]): string {
	if (values.length <= 1) return values[0] ?? ""
	if (values.length === 2) return values.join(" y ")
	return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`
}

export function summarizeMissingPolicyCategories(missingCategories: readonly string[]): string {
	const labels = Array.from(
		new Set(
			missingCategories.map((category) => getPolicyMissingCategoryLabel(category)).filter(Boolean)
		)
	)
	if (labels.length === 0) return "Contrato completo"
	if (labels.length >= 4) return "Sin condiciones configuradas"
	return `Pendientes: ${naturalList(labels)}`
}

export function derivePolicySummaryFromResolvedPolicies(resolved: PolicyResolutionDTO): string {
	const policies = Array.isArray(resolved?.policies) ? resolved.policies : []
	const cancellation = findCategory(policies, (category) => category.includes("cancel"))
	const payment = findCategory(policies, (category) => category === "payment")
	const arrival = findCategory(
		policies,
		(category) => category.includes("checkin") || category.includes("check_in")
	)
	const noShow = findCategory(
		policies,
		(category) => category.includes("noshow") || category.includes("no_show")
	)

	const configuredSummary = Array.from(
		new Set([
			describeCancellation(cancellation),
			describePayment(payment),
			describeArrival(arrival),
			describeNoShow(noShow),
		])
	).filter(Boolean)
	const missingCategories = Array.isArray(resolved?.missingCategories)
		? resolved.missingCategories
		: []

	if (configuredSummary.length === 0) {
		return missingCategories.length
			? summarizeMissingPolicyCategories(missingCategories)
			: "Condiciones configuradas"
	}
	if (missingCategories.length > 0) {
		return `${configuredSummary.join(" · ")} · ${summarizeMissingPolicyCategories(missingCategories)}`
	}
	return configuredSummary.join(" · ")
}
