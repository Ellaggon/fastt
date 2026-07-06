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
	checkOut?: string | null,
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
		checkOut,
		exceptionRules,
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
		byCategory[normalized] = buildPolicyItemSnapshot(
			entry,
			params.checkIn,
			params.checkOut,
			params.exceptionRules
		)
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
