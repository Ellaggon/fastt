// Public API for the policies module.
// External consumers MUST import from "@/modules/policies/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain
export * from "./domain/policy.priority"
export * from "./domain/policy.scope"
export * from "./domain/policy.category"
export * from "./domain/cancellation/cancellationEngine"
export * from "./domain/restrictions/RestrictionRuleEngine"
export * from "./domain/restrictions/restrictions.conflicts"
export * from "./domain/restrictions/restrictions.guards"
export * from "./domain/restrictions/restrictions.params"
export * from "./domain/restrictions/restrictions.priority"
export * from "./domain/restrictions/restrictions.types"

// Application mappers
export * from "./application/mappers/restrictions.mapper"
export * from "./application/mappers/mapResolvedPoliciesToUI"
export * from "./application/mappers/derivePolicySummary"
export * from "./application/errors/policyValidationError"
export type {
	PolicyResolutionDTO,
	PolicyResolutionCoverage,
	PolicyResolutionDTOPolicy,
} from "./application/dto/PolicyResolutionDTO"
export {
	isPolicyResolutionDTO,
	mapDTOToLegacy,
	mapLegacyToDTO,
	normalizePolicyResolutionResult,
} from "./application/adapters/policyResolutionAdapter"
export type { LegacyPolicyResolutionResult } from "./application/adapters/policyResolutionAdapter"

// Application services
export * from "./application/services/RestrictionService"

// Application ports
// NOTE: legacy command/query ports are intentionally not exported.

// CAPA 6 write path (isolated)
export * from "./application/use-cases/capa6/create-policy"
export * from "./application/use-cases/capa6/create-policy-version"
export * from "./application/use-cases/capa6/assign-policy"
export * from "./application/use-cases/capa6/replace-policy-assignment"
export * from "./application/use-cases/build-policy-snapshot"
export * from "./application/use-cases/rate-plan-policies-surface"
export type { ResolveEffectivePoliciesResult } from "./application/use-cases/resolve-effective-policies"

// Application queries (factories for DI wiring)
// NOTE: We intentionally do NOT export legacy query factories or cache/compiler-related ports here.

// Canonical policy resolution (CAPA 6). Isolated container wiring; not yet used by APIs by default.
export async function resolveEffectivePolicies(params: {
	productId: string
	variantId?: string
	ratePlanId?: string
	checkIn?: string
	checkOut?: string
	channel?: string
	requiredCategories?: string[]
	onMissingCategory?: "return_null" | "throw_error"
	includeTrace?: boolean
	requestId?: string
	featureContext?: import("@/config/featureFlags").FeatureFlagContext
	dtoV2Enabled?: boolean
}): Promise<
	| import("./application/dto/PolicyResolutionDTO").PolicyResolutionDTO
	| import("./application/adapters/policyResolutionAdapter").LegacyPolicyResolutionResult
> {
	const { resolveEffectivePoliciesUseCase } = await import(
		"@/container/policies-resolution.container"
	)
	return resolveEffectivePoliciesUseCase(params)
}

export async function createPolicyCapa6(
	params: import("./application/schemas/policy-write/createPolicySchema").CreatePolicyInput
) {
	const { createPolicyCapa6UseCase } = await import("@/container/policies-write.container")
	return createPolicyCapa6UseCase(params)
}

export async function createPolicyVersionCapa6(
	params: import("./application/use-cases/capa6/create-policy-version").CreatePolicyVersionInput
) {
	const { createPolicyVersionCapa6UseCase } = await import("@/container/policies-write.container")
	return createPolicyVersionCapa6UseCase(params)
}

export async function assignPolicyCapa6(
	params: import("./application/schemas/policy-write/assignPolicySchema").AssignPolicyInput
) {
	const { assignPolicyCapa6UseCase } = await import("@/container/policies-write.container")
	return assignPolicyCapa6UseCase(params)
}

export async function replacePolicyAssignmentCapa6(
	params: import("./application/use-cases/capa6/replace-policy-assignment").ReplacePolicyAssignmentInput
) {
	const { replacePolicyAssignmentCapa6UseCase } = await import(
		"@/container/policies-write.container"
	)
	return replacePolicyAssignmentCapa6UseCase(params)
}
