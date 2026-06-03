import {
	clonePolicyPresetCancellationTiers,
	clonePolicyPresetRules,
	resolvePolicyPreset,
} from "@/data/policy/policy-presets"
import type { PolicyCategory } from "../../domain/policy.category"
import { PolicyValidationError } from "../errors/policyValidationError"
import type { CreatePolicyInput } from "../schemas/policy-write/createPolicySchema"
import type { CancellationTierInput } from "../schemas/policy-write/policyContentSchema"

export type ParsedPolicyInputWithPresetDefaults = {
	previousPolicyId?: string
	ownerProviderId?: string
	category: PolicyCategory
	description: string
	status: "draft" | "template" | "active" | "archived"
	policyPresetKey?: string
	stayLengthType: "any" | "short_stay" | "long_stay" | "monthly"
	gracePeriod?: number
	refundBasis?:
		| "total_booking"
		| "room_rate"
		| "first_night"
		| "deposit"
		| "provider_policy"
		| "none"
	payoutBasis?: "gross" | "net" | "collected" | "provider_policy"
	localTimezone?: string
	legalOverrideFlags?: Record<string, boolean>
	rules?: Record<string, unknown>
	cancellationTiers?: CancellationTierInput[]
	effectiveFrom?: string
	effectiveTo?: string
}

function isEmptyRules(value: unknown): boolean {
	return !value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length
}

export function applyPolicyPresetDefaults(params: {
	input: Partial<CreatePolicyInput>
	parsed: ParsedPolicyInputWithPresetDefaults
	category: PolicyCategory
}): ParsedPolicyInputWithPresetDefaults {
	const preset = resolvePolicyPreset(params.parsed.policyPresetKey, params.category)
	if (!params.parsed.policyPresetKey || preset) {
		if (!preset) return params.parsed
	} else {
		throw new PolicyValidationError([{ path: ["policyPresetKey"], code: "unknown_preset" }])
	}

	return {
		...params.parsed,
		policyPresetKey: preset.key,
		description:
			params.input.description == null || String(params.input.description).trim() === ""
				? preset.description
				: params.parsed.description,
		stayLengthType:
			params.input.stayLengthType === undefined
				? preset.stayLengthType
				: params.parsed.stayLengthType,
		gracePeriod:
			params.input.gracePeriod === undefined ? preset.gracePeriod : params.parsed.gracePeriod,
		refundBasis:
			params.input.refundBasis === undefined ? preset.refundBasis : params.parsed.refundBasis,
		payoutBasis:
			params.input.payoutBasis === undefined ? preset.payoutBasis : params.parsed.payoutBasis,
		localTimezone:
			params.input.localTimezone === undefined ? preset.localTimezone : params.parsed.localTimezone,
		legalOverrideFlags:
			params.input.legalOverrideFlags === undefined
				? preset.legalOverrideFlags
				: params.parsed.legalOverrideFlags,
		rules: isEmptyRules(params.input.rules) ? clonePolicyPresetRules(preset) : params.parsed.rules,
		cancellationTiers:
			params.input.cancellationTiers === undefined || params.input.cancellationTiers.length === 0
				? clonePolicyPresetCancellationTiers(preset)
				: params.parsed.cancellationTiers,
	}
}
