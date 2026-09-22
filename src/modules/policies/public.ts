// Public API for the policies module.
// External consumers MUST import from "@/modules/policies/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain
export * from "./domain/policy.priority"
export * from "./domain/policy.scope"
export * from "./domain/policy.category"
export * from "./domain/cancellation/cancellationEngine"
export * from "./domain/overrides/policyExceptionRule"

// Application mappers
export * from "./application/mappers/mapResolvedPoliciesToUI"
export * from "./application/mappers/derivePolicySummary"
export * from "./application/errors/policyValidationError"
export * from "./application/schemas/policy-write/policyContentSchema"
export * from "./application/schemas/policy-write/policyEffectiveDate"
export type {
	PolicyResolutionDTO,
	PolicyResolutionCoverage,
	PolicyResolutionDTOPolicy,
} from "./application/dto/PolicyResolutionDTO"
export { isPolicyResolutionDTO } from "./application/dto/PolicyResolutionDTO"

// Application ports
// NOTE: legacy command/query ports are intentionally not exported.

// CAPA 6 write path (isolated)
export * from "./application/use-cases/capa6/create-policy"
export * from "./application/use-cases/capa6/create-policy-version"
export * from "./application/use-cases/capa6/deactivate-policy-assignment"
export * from "./application/use-cases/capa6/replace-policy-assignment"
export * from "./application/use-cases/build-policy-calculation-snapshot"
export * from "./application/use-cases/build-policy-snapshot"
export * from "./application/use-cases/replace-policy-date-assignment-range"
export * from "./application/use-cases/rate-plan-policies-surface"
export type { ResolveEffectivePoliciesResult } from "./application/use-cases/resolve-effective-policies"
export type {
	PolicyExceptionRuleCreateInput,
	PolicyExceptionRuleListFilter,
	PolicyExceptionRuleContextFilter,
	PolicyExceptionRuleRepositoryPort,
} from "./application/ports/PolicyExceptionRuleRepositoryPort"
export type {
	PolicyCoverageByRatePlan,
	PolicyCoverageQueryParams,
} from "./infrastructure/repositories/PolicyCoverageQueryRepository"

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
}): Promise<import("./application/dto/PolicyResolutionDTO").PolicyResolutionDTO> {
	const { cacheKeys, cacheTtls } = await import("@/lib/cache/cacheKeys")
	const { readThrough } = await import("@/lib/cache/readThrough")
	const { resolveEffectivePoliciesUseCase } =
		await import("@/container/policies-resolution.container")
	const checkIn = String(params.checkIn ?? "").trim()
	const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(checkIn)
		? checkIn
		: new Date().toISOString().slice(0, 10)
	const key = cacheKeys.policyResolution({
		productId: params.productId,
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		asOfDate,
		channel: params.channel,
		requiredCategories: params.requiredCategories,
		onMissingCategory: params.onMissingCategory,
	})
	return readThrough(key, cacheTtls.policyResolution, () => resolveEffectivePoliciesUseCase(params))
}

export async function listPolicyCoverageByProvider(
	params: import("./infrastructure/repositories/PolicyCoverageQueryRepository").PolicyCoverageQueryParams
): Promise<
	import("./infrastructure/repositories/PolicyCoverageQueryRepository").PolicyCoverageByRatePlan[]
> {
	const { PolicyCoverageQueryRepository } =
		await import("./infrastructure/repositories/PolicyCoverageQueryRepository")
	return new PolicyCoverageQueryRepository().listRatePlanCoverageByProvider(params)
}

export async function createPolicyCapa6(
	params: import("./application/use-cases/capa6/create-policy").CreatePolicyCommandInput
) {
	const { createPolicyCapa6UseCase } = await import("@/container/policies-write.container")
	return createPolicyCapa6UseCase(params)
}

export async function createPolicyVersionCapa6(
	params: import("./application/use-cases/capa6/create-policy-version").CreatePolicyVersionInput
) {
	const { createPolicyVersionCapa6UseCase } = await import("@/container/policies-write.container")
	const result = await createPolicyVersionCapa6UseCase(params)
	const { invalidateAllPolicyConditions } = await import("@/lib/cache/invalidation")
	await invalidateAllPolicyConditions("policy_version_created")
	return result
}

export async function replacePolicyAssignmentCapa6(
	params: import("./application/use-cases/capa6/replace-policy-assignment").ReplacePolicyAssignmentInput
) {
	const { replacePolicyAssignmentCapa6UseCase } =
		await import("@/container/policies-write.container")
	const result = await replacePolicyAssignmentCapa6UseCase(params)
	const { invalidateAllPolicyConditions } = await import("@/lib/cache/invalidation")
	await invalidateAllPolicyConditions("policy_assignment_replaced")
	return result
}

export async function deactivatePolicyAssignmentCapa6(
	params: import("./application/use-cases/capa6/deactivate-policy-assignment").DeactivatePolicyAssignmentInput
) {
	const { deactivatePolicyAssignmentCapa6UseCase } =
		await import("@/container/policies-write.container")
	const result = await deactivatePolicyAssignmentCapa6UseCase(params)
	const { invalidateAllPolicyConditions } = await import("@/lib/cache/invalidation")
	await invalidateAllPolicyConditions("policy_assignment_deactivated")
	return result
}
