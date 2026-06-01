import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import { validatePolicyContentForCategory } from "../../schemas/policy-write/policyContentSchema"

// CAPA 6 write path: create an ACTIVE policy version (no draft flow yet).
export async function createPolicyCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	const parsed = createPolicySchema.parse(input)

	let groupId = ""
	let version: number
	let category = parsed.category

	if (parsed.previousPolicyId) {
		const prev = await deps.commandRepo.getPolicyById(parsed.previousPolicyId)
		if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])
		groupId = prev.groupId
		version = Number(prev.version) + 1
		category = prev.category
	} else {
		version = 1
	}

	const content = validatePolicyContentForCategory({
		category,
		rules: parsed.rules,
		cancellationTiers: parsed.cancellationTiers,
	})

	if (!parsed.previousPolicyId) {
		const created = await deps.commandRepo.createPolicyGroup({
			category: parsed.category,
			ownerProviderId: parsed.ownerProviderId ?? null,
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

	return { policyId, groupId, category, version }
}
