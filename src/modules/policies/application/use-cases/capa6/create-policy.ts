import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import { validatePolicyContentForCategory } from "../../schemas/policy-write/policyContentSchema"
import { applyPolicyPresetDefaults } from "../../presets/applyPolicyPreset"

// CAPA 6 write path: create a library policy version.
export async function createPolicyCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	const parsedInput = createPolicySchema.parse(input)

	let groupId = ""
	let version: number
	let category = parsedInput.category

	if (parsedInput.previousPolicyId) {
		const prev = await deps.commandRepo.getPolicyById(parsedInput.previousPolicyId)
		if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])
		groupId = prev.groupId
		version = Number(prev.version) + 1
		category = prev.category
	} else {
		version = 1
	}

	const parsed = applyPolicyPresetDefaults({ input, parsed: parsedInput, category })

	const content = validatePolicyContentForCategory({
		category,
		rules: parsed.rules,
		cancellationTiers: parsed.cancellationTiers,
	})

	if (!parsed.previousPolicyId) {
		if (!parsed.ownerProviderId) {
			throw new PolicyValidationError([{ path: ["ownerProviderId"], code: "required" }])
		}
		const created = await deps.commandRepo.createPolicyGroup({
			category: parsed.category,
			ownerProviderId: parsed.ownerProviderId,
		})
		groupId = created.groupId
	}

	const effectiveFromIso = parsed.effectiveFrom
		? new Date(parsed.effectiveFrom).toISOString()
		: null
	const effectiveToIso = parsed.effectiveTo ? new Date(parsed.effectiveTo).toISOString() : null

	const { policyId } = await deps.commandRepo.createPolicyVersion({
		groupId,
		description: parsed.description ?? "",
		version,
		status: parsed.status,
		effectiveFromIso,
		effectiveToIso,
		metadata: {
			policyPresetKey: parsed.policyPresetKey ?? null,
			stayLengthType: parsed.stayLengthType ?? null,
			gracePeriod: parsed.gracePeriod ?? null,
			refundBasis: parsed.refundBasis ?? null,
			payoutBasis: parsed.payoutBasis ?? null,
			localTimezone: parsed.localTimezone ?? null,
			legalOverrideFlags: parsed.legalOverrideFlags ?? null,
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
		eventType: parsed.previousPolicyId ? "policy_version_created" : "policy_created",
		actorUserId: (input as any).actorUserId ?? null,
		policyId,
		policyGroupId: groupId,
		before: parsed.previousPolicyId ? { previousPolicyId: parsed.previousPolicyId } : null,
		after: {
			policyId,
			groupId,
			category,
			version,
			status: parsed.status,
			effectiveFrom: effectiveFromIso,
			effectiveTo: effectiveToIso,
			policyPresetKey: parsed.policyPresetKey ?? null,
		},
	})

	return { policyId, groupId, category, version }
}
