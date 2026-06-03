import type { ResolveEffectivePoliciesResult } from "./resolve-effective-policies"
import {
	type AppliedPolicyExceptionRule,
	type PolicyExceptionRule,
} from "../../domain/overrides/policyExceptionRule"
import {
	buildPolicyCalculationSnapshot,
	type PolicyCalculationSnapshot,
} from "./build-policy-calculation-snapshot"

type SnapshotCategory = "cancellation" | "payment" | "no_show" | "check_in"

export type HoldPolicyItemSnapshot = {
	category: SnapshotCategory
	policyId: string
	groupId: string
	version: number
	description: string
	resolvedFromScope: string
	source?: {
		policyId: string
		groupId: string
		version: number
		resolvedFromScope: string
		policyPresetKey: string | null
	}
	metadata?: {
		policyPresetKey: string | null
		stayLengthType: string | null
		gracePeriod: number | null
		refundBasis: string | null
		payoutBasis: string | null
		localTimezone: string | null
		legalOverrideFlags: Record<string, boolean> | null
	}
	calculation?: PolicyCalculationSnapshot
	appliedOverrides?: AppliedPolicyExceptionRule[]
	rules: unknown[]
	cancellationTiers: unknown[]
}

export type HoldPolicySnapshot = {
	cancellation: HoldPolicyItemSnapshot | null
	payment: HoldPolicyItemSnapshot | null
	no_show: HoldPolicyItemSnapshot | null
	check_in: HoldPolicyItemSnapshot | null
	// Contractual/operational rules derived from policies only.
	ruleSnapshotJson?: {
		contractTerms: Array<{
			ruleId: string
			version: number
			category: string
			content: unknown
			source: "policy"
			timestamp: string
		}>
		hardConstraintEvidence: Array<{
			ruleId: string
			version: number
			category: string
			source: "policy"
			timestamp: string
		}>
	}
	// Non-contractual validation trace for dual-mode policy/rule migration.
	// This field is optional and debug-only.
	ruleValidationJson?: {
		isConsistent: boolean
		mismatches: Array<{
			category: "cancellation" | "payment" | "no_show" | "check_in"
			type: "missing" | "value_mismatch" | "structure_mismatch"
			details: string
		}>
		comparedAt: string
	}
	// Shadow contract generated from rules. Non-authoritative during migration.
	ruleBasedContractSnapshot?: {
		cancellation: {
			category: string
			ruleId: string
			version: number
			description: string
			source: "policy"
			rules: Record<string, unknown>
			cancellationTiers: Array<{
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			}>
		} | null
		payment: {
			category: string
			ruleId: string
			version: number
			description: string
			source: "policy"
			rules: Record<string, unknown>
			cancellationTiers: Array<{
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			}>
		} | null
		no_show: {
			category: string
			ruleId: string
			version: number
			description: string
			source: "policy"
			rules: Record<string, unknown>
			cancellationTiers: Array<{
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			}>
		} | null
		check_in: {
			category: string
			ruleId: string
			version: number
			description: string
			source: "policy"
			rules: Record<string, unknown>
			cancellationTiers: Array<{
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			}>
		} | null
		meta: {
			resolvedAt: string
			checkIn: string
			checkOut: string
			channel: string | null
		}
	}
	// Shadow diff between authoritative policy contract and rule-derived contract.
	contractComparisonJson?: {
		isConsistent: boolean
		diffs: Array<{
			category: "cancellation" | "payment" | "no_show" | "check_in"
			diffKind:
				| "missing_category"
				| "penalty_diff"
				| "cancellation_window_diff"
				| "payment_timing_diff"
				| "no_show_rule_diff"
				| "structure_diff"
			details: string
			policyValue: unknown
			ruleValue: unknown
		}>
		comparedAt: string
	}
	meta: {
		policyVersionIds: string[]
		resolvedAt: string
		checkIn: string
		checkOut: string
		channel: string | null
	}
}

function normalizeCategory(category: string): SnapshotCategory | null {
	const normalized = String(category ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")

	if (normalized.includes("cancel")) return "cancellation"
	if (normalized === "payment") return "payment"
	if (normalized === "noshow") return "no_show"
	if (normalized === "checkin") return "check_in"
	return null
}

export function buildPolicyItemSnapshot(
	entry: ResolveEffectivePoliciesResult["policies"][number],
	checkIn: string,
	exceptionRules?: PolicyExceptionRule[]
): HoldPolicyItemSnapshot {
	const normalized = normalizeCategory(entry.category)
	if (!normalized) {
		throw new Error(`UNSUPPORTED_POLICY_CATEGORY:${entry.category}`)
	}
	const calculationResult = buildPolicyCalculationSnapshot({
		category: normalized,
		policy: entry.policy,
		checkIn,
		exceptionRules,
		resolvedFromScope: entry.resolvedFromScope,
		scopeId: (entry as any).scopeId ?? null,
	})
	return {
		category: normalized,
		policyId: String(entry.policy.id),
		groupId: String(entry.policy.groupId),
		version: Number(entry.policy.version ?? 0),
		description: String(entry.policy.description ?? ""),
		resolvedFromScope: String(entry.resolvedFromScope ?? "global"),
		source: {
			policyId: String(entry.policy.id),
			groupId: String(entry.policy.groupId),
			version: Number(entry.policy.version ?? 0),
			resolvedFromScope: String(entry.resolvedFromScope ?? "global"),
			policyPresetKey:
				entry.policy.policyPresetKey == null ? null : String(entry.policy.policyPresetKey),
		},
		metadata: {
			policyPresetKey:
				entry.policy.policyPresetKey == null ? null : String(entry.policy.policyPresetKey),
			stayLengthType:
				entry.policy.stayLengthType == null ? null : String(entry.policy.stayLengthType),
			gracePeriod: entry.policy.gracePeriod == null ? null : Number(entry.policy.gracePeriod),
			refundBasis: entry.policy.refundBasis == null ? null : String(entry.policy.refundBasis),
			payoutBasis: entry.policy.payoutBasis == null ? null : String(entry.policy.payoutBasis),
			localTimezone: entry.policy.localTimezone == null ? null : String(entry.policy.localTimezone),
			legalOverrideFlags: (entry.policy.legalOverrideFlags ?? null) as Record<
				string,
				boolean
			> | null,
		},
		calculation: calculationResult.calculation,
		appliedOverrides: calculationResult.appliedOverrides,
		rules: Array.isArray(entry.policy.rules) ? entry.policy.rules : [],
		cancellationTiers: Array.isArray(entry.policy.cancellationTiers)
			? entry.policy.cancellationTiers
			: [],
	}
}

export function buildPolicySnapshot(params: {
	resolvedPolicies: ResolveEffectivePoliciesResult
	checkIn: string
	checkOut: string
	channel?: string | null
	resolvedAt?: Date
	exceptionRules?: PolicyExceptionRule[]
}): HoldPolicySnapshot {
	const byCategory: Record<SnapshotCategory, HoldPolicyItemSnapshot | null> = {
		cancellation: null,
		payment: null,
		no_show: null,
		check_in: null,
	}

	for (const entry of params.resolvedPolicies.policies) {
		const normalized = normalizeCategory(entry.category)
		if (!normalized) continue
		byCategory[normalized] = buildPolicyItemSnapshot(entry, params.checkIn, params.exceptionRules)
	}

	const policyVersionIds = Object.values(byCategory)
		.filter((item): item is HoldPolicyItemSnapshot => Boolean(item))
		.map((item) => item.policyId)
		.sort((a, b) => a.localeCompare(b))

	return {
		cancellation: byCategory.cancellation,
		payment: byCategory.payment,
		no_show: byCategory.no_show,
		check_in: byCategory.check_in,
		meta: {
			policyVersionIds,
			resolvedAt: (params.resolvedAt ?? new Date()).toISOString(),
			checkIn: params.checkIn,
			checkOut: params.checkOut,
			channel: params.channel == null ? null : String(params.channel),
		},
	}
}
