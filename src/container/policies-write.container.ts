import { createPolicyCapa6 } from "@/modules/policies/application/use-cases/capa6/create-policy"
import { createPolicyVersionCapa6 } from "@/modules/policies/application/use-cases/capa6/create-policy-version"
import { assignPolicyCapa6 } from "@/modules/policies/application/use-cases/capa6/assign-policy"
import { replacePolicyAssignmentCapa6 } from "@/modules/policies/application/use-cases/capa6/replace-policy-assignment"
import { togglePolicyAssignmentCapa6 } from "@/modules/policies/application/use-cases/capa6/toggle-policy-assignment"

import { PolicyCommandRepositoryCapa6 } from "@/modules/policies/infrastructure/repositories/PolicyCommandRepositoryCapa6"
import { PolicyAssignmentRepositoryCapa6 } from "@/modules/policies/infrastructure/repositories/PolicyAssignmentRepositoryCapa6"

const policyCommandRepoCapa6 = new PolicyCommandRepositoryCapa6()
const policyAssignmentRepoCapa6 = new PolicyAssignmentRepositoryCapa6()

export async function createPolicyCapa6UseCase(input: Parameters<typeof createPolicyCapa6>[1]) {
	return createPolicyCapa6({ commandRepo: policyCommandRepoCapa6 }, input)
}

export async function createPolicyVersionCapa6UseCase(
	input: Parameters<typeof createPolicyVersionCapa6>[1]
) {
	return createPolicyVersionCapa6({ commandRepo: policyCommandRepoCapa6 }, input)
}

export async function assignPolicyCapa6UseCase(input: Parameters<typeof assignPolicyCapa6>[1]) {
	return assignPolicyCapa6(
		{ commandRepo: policyCommandRepoCapa6, assignmentRepo: policyAssignmentRepoCapa6 },
		input
	)
}

export async function replacePolicyAssignmentCapa6UseCase(
	input: Parameters<typeof replacePolicyAssignmentCapa6>[1]
) {
	const { resolveEffectivePoliciesUseCase } = await import(
		"@/container/policies-resolution.container"
	)
	return replacePolicyAssignmentCapa6(
		{
			commandRepo: policyCommandRepoCapa6,
			assignmentRepo: policyAssignmentRepoCapa6,
			resolveEffectivePolicies: (ctx) => resolveEffectivePoliciesUseCase(ctx),
		},
		input
	)
}

export async function togglePolicyAssignmentCapa6UseCase(
	input: Parameters<typeof togglePolicyAssignmentCapa6>[1]
) {
	return togglePolicyAssignmentCapa6(
		{
			assignmentRepo: policyAssignmentRepoCapa6,
		},
		input
	)
}
