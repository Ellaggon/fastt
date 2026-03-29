import {
	assignPolicySchema,
	type AssignPolicyInput,
} from "../../schemas/policy-write/assignPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

export async function assignPolicyCapa6(
	deps: {
		commandRepo: PolicyCommandRepositoryPortCapa6
		assignmentRepo: PolicyAssignmentRepositoryPortCapa6
	},
	input: AssignPolicyInput
): Promise<{ assignmentId: string; scope: string; scopeId: string }> {
	const parsed = assignPolicySchema.parse(input)
	const channel = parsed.channel ?? null

	const policy = await deps.commandRepo.getPolicyById(parsed.policyId)
	if (!policy) throw new PolicyValidationError([{ path: ["policyId"], code: "not_found" }])
	if (String(policy.status) !== "active") {
		throw new PolicyValidationError([{ path: ["policyId"], code: "policy_not_active" }])
	}

	// Validate scope existence.
	const exists = await deps.assignmentRepo.scopeExists({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
	})
	if (!exists) throw new PolicyValidationError([{ path: ["scopeId"], code: "not_found" }])

	// Prevent duplicates within same (scope, scopeId, category, channel).
	const dup = await deps.assignmentRepo.findActiveAssignmentByScopeCategoryChannel({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		category: policy.category,
		channel,
	})
	if (dup) {
		throw new PolicyValidationError([{ path: ["scopeId"], code: "duplicate_assignment" }])
	}

	const { assignmentId } = await deps.assignmentRepo.createAssignment({
		policyGroupId: policy.groupId,
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		channel,
	})

	return { assignmentId, scope: parsed.scope, scopeId: parsed.scopeId }
}
