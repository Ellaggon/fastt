import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"

// CAPA 6 write path: create an ACTIVE policy version (no draft flow yet).
export async function createPolicyCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	const parsed = createPolicySchema.parse(input)

	let groupId: string
	let version: number
	let category = parsed.category

	if (parsed.previousPolicyId) {
		const prev = await deps.commandRepo.getPolicyById(parsed.previousPolicyId)
		if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])
		groupId = prev.groupId
		version = Number(prev.version) + 1
		category = prev.category
	} else {
		const created = await deps.commandRepo.createPolicyGroup({ category: parsed.category })
		groupId = created.groupId
		version = 1
	}

	// Validate cancellation structure if category demands it.
	if (
		category === "Cancellation" &&
		(!parsed.cancellationTiers || parsed.cancellationTiers.length === 0)
	) {
		throw new PolicyValidationError([{ path: ["cancellationTiers"], code: "required" }])
	}

	const effectiveFromIso = parsed.effectiveFrom
		? new Date(parsed.effectiveFrom).toISOString()
		: null
	const effectiveToIso = parsed.effectiveTo ? new Date(parsed.effectiveTo).toISOString() : null

	const { policyId } = await deps.commandRepo.createPolicyVersion({
		groupId,
		description: parsed.description ?? "",
		version,
		status: "active",
		effectiveFromIso,
		effectiveToIso,
	})

	const rulesArray = parsed.rules
		? Object.entries(parsed.rules).map(([ruleKey, ruleValue]) => ({ ruleKey, ruleValue }))
		: []

	await deps.commandRepo.replacePolicyRules({ policyId, rules: rulesArray })

	if (category === "Cancellation" && parsed.cancellationTiers) {
		await deps.commandRepo.replaceCancellationTiers({ policyId, tiers: parsed.cancellationTiers })
	}

	return { policyId, groupId, category, version }
}
