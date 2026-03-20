// Public API for the policies module.
// External consumers MUST import from "@/modules/policies/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain
export * from "./domain/policy.priority"
export * from "./domain/cancellation/cancellationEngine"
export * from "./domain/restrictions/RestrictionRuleEngine"
export * from "./domain/restrictions/restrictions.conflicts"
export * from "./domain/restrictions/restrictions.guards"
export * from "./domain/restrictions/restrictions.params"
export * from "./domain/restrictions/restrictions.priority"
export * from "./domain/restrictions/restrictions.types"

// Application mappers
export * from "./application/mappers/restrictions.mapper"

// Application services
export * from "./application/services/RestrictionService"

// Application ports
export * from "./application/ports/EffectivePolicyRepositoryPort"
export * from "./application/ports/PolicyCachePort"
export * from "./application/ports/PolicyCommandRepositoryPort"
export * from "./application/ports/PolicyQueryRepositoryPort"

// Application use-cases
export * from "./application/use-cases/activate-policy"
export * from "./application/use-cases/apply-policy-preset"
export * from "./application/use-cases/assign-policy-group"
export * from "./application/use-cases/build-policy-snapshot"
export * from "./application/use-cases/create-policy"
export * from "./application/use-cases/create-policy-version"
export * from "./application/use-cases/delete-draft-policy"
export * from "./application/use-cases/get-policy"
export * from "./application/use-cases/list-assigned-policies"
export * from "./application/use-cases/list-policy-history"
export * from "./application/use-cases/resolve-policies"
export * from "./application/use-cases/resolve-policy-by-hierarchy"
export * from "./application/use-cases/run-policy-compiler"
export * from "./application/use-cases/unassign-policy-group"

// Application queries (factories for DI wiring)
export * from "./application/queries"

// Runtime queries (wired in container). Async wrapper to avoid eager container/DB load in unit tests.
export async function resolveHotelPolicies(productId: string) {
	const { resolveHotelPolicies } = await import("@/container")
	return resolveHotelPolicies(productId)
}
