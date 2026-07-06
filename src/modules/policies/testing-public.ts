// Test-facing API for the policies module.
// Keep this surface minimal and stable; do not expose infrastructure.

export {
	resolveEffectivePolicies,
	resolveEffectivePoliciesByContract,
} from "./application/use-cases/resolve-effective-policies"

export type {
	PolicyAssignmentSnapshot,
	PolicyResolutionRepositoryPort,
	PolicySnapshot,
} from "./application/ports/PolicyResolutionRepositoryPort"

export { createPolicyCapa6 } from "./application/use-cases/capa6/create-policy"
export { createPolicyVersionCapa6 } from "./application/use-cases/capa6/create-policy-version"
export { deactivatePolicyAssignmentCapa6 } from "./application/use-cases/capa6/deactivate-policy-assignment"
export { replacePolicyAssignmentCapa6 } from "./application/use-cases/capa6/replace-policy-assignment"
