import {
	assignPolicySchema,
	type AssignPolicyInput,
} from "../../schemas/policy-write/assignPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

export type ReplacePolicyAssignmentInput = AssignPolicyInput & {
	actorUserId?: string
}

// Replace semantics for overrides:
// - deactivate current active assignment for (scope, scopeId, category, channel)
// - create a new assignment for the selected policy's group
// This keeps history and avoids destructive deletes.
export async function replacePolicyAssignmentCapa6(
	deps: {
		commandRepo: PolicyCommandRepositoryPortCapa6
		assignmentRepo: PolicyAssignmentRepositoryPortCapa6
	},
	input: ReplacePolicyAssignmentInput
): Promise<{ assignmentId: string; replaced: boolean }> {
	const parsed = assignPolicySchema.parse(input)
	const channel = parsed.channel ?? null

	const policy = await deps.commandRepo.getPolicyById(parsed.policyId)
	if (!policy) throw new PolicyValidationError([{ path: ["policyId"], code: "not_found" }])
	if (String(policy.status) !== "active") {
		throw new PolicyValidationError([{ path: ["policyId"], code: "policy_not_active" }])
	}
	const group = await deps.commandRepo.getPolicyGroupById(policy.groupId)
	if (!group || !String(group.ownerProviderId ?? "").trim()) {
		throw new PolicyValidationError([{ path: ["policyId"], code: "owner_provider_required" }])
	}
	if (policy.effectiveFrom && policy.effectiveTo && policy.effectiveFrom > policy.effectiveTo) {
		throw new PolicyValidationError([{ path: ["policyId"], code: "invalid_effective_window" }])
	}

	const context = await deps.assignmentRepo.resolveScopeContext({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
	})
	if (!context) throw new PolicyValidationError([{ path: ["scopeId"], code: "not_found" }])
	if (context.providerId !== group.ownerProviderId) {
		throw new PolicyValidationError([{ path: ["scopeId"], code: "owner_provider_mismatch" }])
	}

	return deps.assignmentRepo.replaceActiveAssignment({
		policyId: policy.id,
		policyGroupId: policy.groupId,
		ownerProviderId: group.ownerProviderId,
		category: policy.category,
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		channel,
		actorUserId: input.actorUserId ?? null,
	})
}
