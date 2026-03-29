import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"

export type CreatePolicyVersionInput = Omit<CreatePolicyInput, "category"> & {
	previousPolicyId: string
	// category is derived from group; must not be user-controlled for versioning.
	category?: never
}

// Booking.com style versioning:
// - Never edit an existing policy row
// - Always create a new active version in the same group
// - Do not touch assignments (they point to groupId)
export async function createPolicyVersionCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyVersionInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	// Reuse the existing schema for payload shape, but enforce previousPolicyId as required.
	const parsed = createPolicySchema.parse({
		...input,
		// placeholder; will be replaced by derived category
		category: "Other" as any,
	})

	if (!parsed.previousPolicyId) {
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "required" }])
	}

	const prev = await deps.commandRepo.getPolicyById(parsed.previousPolicyId)
	if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])

	const groupId = prev.groupId
	const group = await deps.commandRepo.getPolicyGroupById(groupId)
	if (!group)
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "group_not_found" }])

	const category = group.category
	const maxV = await deps.commandRepo.getMaxPolicyVersionByGroupId(groupId)
	const version = Number(maxV) + 1

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
