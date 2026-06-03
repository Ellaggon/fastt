import {
	primaryPolicyExceptionOverride,
	type AppliedPolicyExceptionRule,
	type PolicyExceptionRule,
} from "../../domain/overrides/policyExceptionRule"
import type { ResolveEffectivePoliciesResult } from "./resolve-effective-policies"

export type PolicyCalculationCategory = "cancellation" | "payment" | "no_show" | "check_in"

export type PolicyCalculationSnapshot = {
	localTimezone: string
	override: {
		applied: boolean
		ruleId: string | null
		type: string | null
		reason: string | null
		action: Record<string, unknown> | null
	}
	cancellation: {
		refundTiers: Array<{
			daysBeforeArrival: number
			deadlineLocal: string
			penaltyType: string
			penaltyAmount: number | null
			refundPercent: number | null
			refundBasis: string | null
			taxesFeesBasis: "refund_basis" | "non_refundable" | "manual_review"
			payoutImpact: {
				payoutBasis: string | null
				hostPayoutPercent: number | null
				platformAbsorbsRefund: boolean
			}
		}>
		freeCancellationDeadlineLocal: string | null
		taxesFeesBasis: "refund_basis" | "non_refundable" | "manual_review"
		payoutImpact: {
			payoutBasis: string | null
			hostPayoutPercent: number | null
			platformAbsorbsRefund: boolean
		}
	} | null
	payment: {
		paymentType: string | null
		paymentDueLocal: string | null
		prepaymentPercentage: number | null
		payoutBasis: string | null
	} | null
	noShow: {
		chargeType: string | null
		chargeAmount: number | null
		chargeBasis: string | null
		payoutImpact: {
			payoutBasis: string | null
			hostPayoutPercent: number | null
			platformAbsorbsRefund: boolean
		}
	} | null
}

export type PolicyCalculationResult = {
	calculation: PolicyCalculationSnapshot
	appliedOverrides: AppliedPolicyExceptionRule[]
}

function dateOnlyMinusDays(dateOnly: string, days: number): string {
	const parsed = new Date(`${String(dateOnly).slice(0, 10)}T00:00:00.000Z`)
	if (Number.isNaN(parsed.getTime())) return String(dateOnly).slice(0, 10)
	parsed.setUTCDate(parsed.getUTCDate() - Math.max(0, Number(days) || 0))
	return parsed.toISOString().slice(0, 10)
}

function localDeadline(dateOnly: string, daysBeforeArrival: number, timezone: string): string {
	return `${dateOnlyMinusDays(dateOnly, daysBeforeArrival)}T00:00:00[${timezone}]`
}

function rulesMap(rules: unknown[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const rule of Array.isArray(rules) ? rules : []) {
		const key = String((rule as any)?.ruleKey ?? "").trim()
		if (!key) continue
		out[key] = (rule as any).ruleValue
	}
	return out
}

function numberOrNull(value: unknown): number | null {
	if (value == null || value === "") return null
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

function percentOrNull(value: unknown): number | null {
	const n = numberOrNull(value)
	if (n == null) return null
	return Math.max(0, Math.min(100, n))
}

function overrideSnapshot(override: AppliedPolicyExceptionRule | null) {
	return {
		applied: Boolean(override),
		ruleId: override?.id ?? null,
		type: override?.type ?? null,
		reason: override?.reason ?? null,
		action: override?.action ? ({ ...override.action } as Record<string, unknown>) : null,
	}
}

function taxesFeesBasis(refundBasis: string | null, refundPercent: number | null) {
	if (refundBasis == null) return "manual_review" as const
	if (Number(refundPercent ?? 0) <= 0) return "non_refundable" as const
	return "refund_basis" as const
}

function payoutImpact(params: {
	payoutBasis: string | null
	refundPercent: number | null
	payoutOverridePercent?: number | null
	override?: AppliedPolicyExceptionRule | null
}) {
	const hostPayoutPercent =
		params.payoutOverridePercent ??
		(params.refundPercent == null ? null : Math.max(0, Math.min(100, 100 - params.refundPercent)))
	return {
		payoutBasis: params.payoutBasis,
		hostPayoutPercent,
		platformAbsorbsRefund: Boolean(params.override?.action.payoutOverrideBasis),
	}
}

export function buildPolicyCalculationSnapshot(params: {
	category: PolicyCalculationCategory
	policy: ResolveEffectivePoliciesResult["policies"][number]["policy"]
	checkIn: string
	exceptionRules?: PolicyExceptionRule[]
	resolvedFromScope?: string | null
	scopeId?: string | null
}): PolicyCalculationResult {
	const override = primaryPolicyExceptionOverride(params.exceptionRules, {
		category: params.category,
		asOfDate: params.checkIn,
		scope: params.resolvedFromScope,
		scopeId: params.scopeId,
	})
	const localTimezone = String(params.policy.localTimezone ?? "property_local")
	const metadataRefundBasis =
		params.policy.refundBasis == null ? null : String(params.policy.refundBasis)
	const metadataPayoutBasis =
		params.policy.payoutBasis == null ? null : String(params.policy.payoutBasis)
	const mappedRules = rulesMap(Array.isArray(params.policy.rules) ? params.policy.rules : [])
	const overridePercent = percentOrNull(override?.action.refundOverridePercent)
	const payoutOverridePercent = percentOrNull(override?.action.payoutOverridePercent)
	const forcedRefundBasis =
		override?.action.forceRefundBasis == null ? null : String(override.action.forceRefundBasis)
	const payoutOverrideBasis =
		override?.action.payoutOverrideBasis == null
			? null
			: String(override.action.payoutOverrideBasis)

	if (params.category === "cancellation") {
		const refundTiers = (
			Array.isArray(params.policy.cancellationTiers) ? params.policy.cancellationTiers : []
		)
			.map((tier: any) => {
				const daysBeforeArrival = Number(tier.daysBeforeArrival ?? 0)
				const penaltyType = String(tier.penaltyType ?? "")
				const penaltyAmount = numberOrNull(tier.penaltyAmount)
				const refundPercent =
					penaltyType === "percentage" && penaltyAmount != null
						? Math.max(0, Math.min(100, 100 - penaltyAmount))
						: null
				const effectiveRefundPercent = overridePercent ?? refundPercent
				const refundBasis = forcedRefundBasis ?? metadataRefundBasis
				const effectivePayoutImpact = payoutImpact({
					payoutBasis: payoutOverrideBasis ?? metadataPayoutBasis,
					refundPercent: effectiveRefundPercent,
					payoutOverridePercent,
					override,
				})
				return {
					daysBeforeArrival,
					deadlineLocal: localDeadline(params.checkIn, daysBeforeArrival, localTimezone),
					penaltyType: overridePercent == null ? penaltyType : "percentage",
					penaltyAmount:
						overridePercent == null
							? penaltyAmount
							: Math.max(0, Math.min(100, 100 - overridePercent)),
					refundPercent: effectiveRefundPercent,
					refundBasis,
					taxesFeesBasis: taxesFeesBasis(refundBasis, effectiveRefundPercent),
					payoutImpact: effectivePayoutImpact,
				}
			})
			.sort((a, b) => b.daysBeforeArrival - a.daysBeforeArrival)
		const freeTier = refundTiers.find((tier) => Number(tier.refundPercent ?? -1) >= 100)
		const bestTier = refundTiers[0] ?? null
		return {
			calculation: {
				localTimezone,
				override: overrideSnapshot(override),
				cancellation: {
					refundTiers,
					freeCancellationDeadlineLocal: freeTier?.deadlineLocal ?? null,
					taxesFeesBasis: bestTier?.taxesFeesBasis ?? "manual_review",
					payoutImpact:
						bestTier?.payoutImpact ??
						payoutImpact({
							payoutBasis: payoutOverrideBasis ?? metadataPayoutBasis,
							refundPercent: overridePercent,
							payoutOverridePercent,
							override,
						}),
				},
				payment: null,
				noShow: null,
			},
			appliedOverrides: override ? [override] : [],
		}
	}

	if (params.category === "payment") {
		const paymentType = String(mappedRules.paymentType ?? "") || null
		const prepaymentDays = numberOrNull(mappedRules.prepaymentDaysBeforeArrival) ?? 0
		return {
			calculation: {
				localTimezone,
				override: overrideSnapshot(override),
				cancellation: null,
				payment: {
					paymentType,
					paymentDueLocal:
						paymentType === "prepayment"
							? localDeadline(params.checkIn, prepaymentDays, localTimezone)
							: null,
					prepaymentPercentage: numberOrNull(mappedRules.prepaymentPercentage),
					payoutBasis: payoutOverrideBasis ?? metadataPayoutBasis,
				},
				noShow: null,
			},
			appliedOverrides: override ? [override] : [],
		}
	}

	if (params.category === "no_show") {
		const waiveNoShowCharge = override?.action.waiveNoShowCharge === true
		return {
			calculation: {
				localTimezone,
				override: overrideSnapshot(override),
				cancellation: null,
				payment: null,
				noShow: {
					chargeType: waiveNoShowCharge ? "waived" : String(mappedRules.penaltyType ?? "") || null,
					chargeAmount: waiveNoShowCharge
						? 0
						: (payoutOverridePercent ?? numberOrNull(mappedRules.penaltyAmount)),
					chargeBasis: forcedRefundBasis ?? metadataRefundBasis,
					payoutImpact: payoutImpact({
						payoutBasis: payoutOverrideBasis ?? metadataPayoutBasis,
						refundPercent: waiveNoShowCharge ? 100 : null,
						payoutOverridePercent,
						override,
					}),
				},
			},
			appliedOverrides: override ? [override] : [],
		}
	}

	return {
		calculation: {
			localTimezone,
			override: overrideSnapshot(override),
			cancellation: null,
			payment: null,
			noShow: null,
		},
		appliedOverrides: override ? [override] : [],
	}
}
