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

export { createPolicyVersionCapa6 } from "./application/use-cases/capa6/create-policy-version"
export { changePolicyLibraryStatusCapa6 } from "./application/use-cases/capa6/change-policy-library-status"
export { replacePolicyAssignmentCapa6 } from "./application/use-cases/capa6/replace-policy-assignment"
export { togglePolicyAssignmentCapa6 } from "./application/use-cases/capa6/toggle-policy-assignment"
