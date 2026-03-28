import {
	assignPolicySchema,
	type AssignPolicyInput,
} from "../../schemas/policy-write/assignPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

// Replace semantics for overrides:
// - deactivate current active assignment for (scope, scopeId, category, channel)
// - create a new assignment for the selected policy's group
// This keeps history and avoids destructive deletes.
export async function replacePolicyAssignmentCapa6(
	deps: {
		commandRepo: PolicyCommandRepositoryPortCapa6
		assignmentRepo: PolicyAssignmentRepositoryPortCapa6
	},
	input: AssignPolicyInput
): Promise<{ assignmentId: string; replaced: boolean }> {
	const parsed = assignPolicySchema.parse(input)
	const channel = parsed.channel ?? null

	const policy = await deps.commandRepo.getPolicyById(parsed.policyId)
	if (!policy) throw new PolicyValidationError([{ path: ["policyId"], code: "not_found" }])
	if (String(policy.status) !== "active") {
		throw new PolicyValidationError([{ path: ["policyId"], code: "policy_not_active" }])
	}

	const exists = await deps.assignmentRepo.scopeExists({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
	})
	if (!exists) throw new PolicyValidationError([{ path: ["scopeId"], code: "not_found" }])

	const current = await deps.assignmentRepo.findActiveAssignmentByScopeCategoryChannel({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		category: policy.category,
		channel,
	})

	if (current) {
		await deps.assignmentRepo.deactivateAssignmentById(current.id)
	}

	const { assignmentId } = await deps.assignmentRepo.createAssignment({
		policyGroupId: policy.groupId,
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		channel,
	})

	return { assignmentId, replaced: Boolean(current) }
}
