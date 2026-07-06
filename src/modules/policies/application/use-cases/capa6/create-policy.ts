import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import { validatePolicyContentForCategory } from "../../schemas/policy-write/policyContentSchema"
import { applyPolicyPresetDefaults } from "../../presets/applyPolicyPreset"
import { normalizePolicyEffectiveDate } from "../../schemas/policy-write/policyEffectiveDate"

export type CreatePolicyCommandInput = CreatePolicyInput & {
	actorUserId?: string
}

// CAPA 6 write path: create a library policy version.
export async function createPolicyCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyCommandInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	if (!String(input.ownerProviderId ?? "").trim()) {
		throw new PolicyValidationError([
			{ path: ["ownerProviderId"], code: "owner_provider_required" },
		])
	}
	const parsedInput = createPolicySchema.parse(input)
	const category = parsedInput.category
	const version = 1
	const parsed = applyPolicyPresetDefaults({
		input,
		parsed: { ...parsedInput, category },
		category,
	})

	const content = validatePolicyContentForCategory({
		category,
		rules: parsed.rules,
		cancellationTiers: parsed.cancellationTiers,
	})

	const effectiveFrom = normalizePolicyEffectiveDate(parsed.effectiveFrom)
	const effectiveTo = normalizePolicyEffectiveDate(parsed.effectiveTo)
	if (parsed.effectiveFrom && !effectiveFrom) {
		throw new PolicyValidationError([{ path: ["effectiveFrom"], code: "invalid_date" }])
	}
	if (parsed.effectiveTo && !effectiveTo) {
		throw new PolicyValidationError([{ path: ["effectiveTo"], code: "invalid_date" }])
	}
	if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
		throw new PolicyValidationError([
			{ path: ["effectiveFrom", "effectiveTo"], code: "invalid_date_range" },
		])
	}

	const { groupId } = await deps.commandRepo.createPolicyGroup({
		category,
		ownerProviderId: parsedInput.ownerProviderId,
	})

	const { policyId } = await deps.commandRepo.createPolicyVersion({
		groupId,
		description: parsed.description ?? "",
		version,
		status: parsed.status,
		effectiveFrom,
		effectiveTo,
		metadata: {
			policyPresetKey: parsed.policyPresetKey ?? null,
			stayLengthType: parsed.stayLengthType ?? null,
			gracePeriod: parsed.gracePeriod ?? null,
			refundBasis: parsed.refundBasis ?? null,
			payoutBasis: parsed.payoutBasis ?? null,
			localTimezone: parsed.localTimezone ?? null,
		},
	})

	const rulesArray = content.rules
		? Object.entries(content.rules).map(([ruleKey, ruleValue]) => ({ ruleKey, ruleValue }))
		: []

	await deps.commandRepo.replacePolicyRules({ policyId, rules: rulesArray })

	if (category === "Cancellation" && content.cancellationTiers) {
		await deps.commandRepo.replaceCancellationTiers({
			policyId,
			tiers: content.cancellationTiers,
		})
	}

	await deps.commandRepo.createAuditLog({
		eventType: "policy_created",
		actorUserId: input.actorUserId ?? null,
		policyId,
		policyGroupId: groupId,
		before: null,
		after: {
			policyId,
			groupId,
			category,
			version,
			status: parsed.status,
			effectiveFrom,
			effectiveTo,
			policyPresetKey: parsed.policyPresetKey ?? null,
		},
	})

	return { policyId, groupId, category, version }
}
