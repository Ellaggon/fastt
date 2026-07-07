// Public API for the canonical PropertyRule domain (foundational, read-only).
// External consumers MUST import from "@/modules/rules/public".

import "./infrastructure/wiring/configure-effective-restrictions-materializer"

export * from "./domain/rule.types"
export * from "./domain/rule.entities"
export * from "./domain/rule.catalog"
export * from "./domain/restrictions/RestrictionRuleEngine"
export * from "./domain/restrictions/restrictions.conflicts"
export * from "./domain/restrictions/restrictions.guards"
export * from "./domain/restrictions/restrictions.params"
export * from "./domain/restrictions/restrictions.priority"
export * from "./domain/restrictions/restrictions.types"
export * from "./application/adapters/policy-to-rule.adapter"
export * from "./application/mappers/restrictions.mapper"
export * from "./application/mappers/map-rules-to-policy-view-model"
export * from "./application/services/RestrictionService"
export * from "./application/use-cases/build-rule-snapshot"
export * from "./application/use-cases/recompute-effective-restrictions"
export type {
	ResolveEffectiveRulesInput,
	ResolveEffectiveRulesResult,
} from "./application/use-cases/resolve-effective-rules"

export async function resolveEffectiveRules(input: {
	productId: string
	variantId?: string
	ratePlanId?: string
	checkIn?: string
	checkOut?: string
	channel?: string
	requiredCategories?: string[]
	onMissingCategory?: "return_null" | "throw_error"
}) {
	const { createResolveEffectiveRulesUseCase } =
		await import("./application/use-cases/resolve-effective-rules")
	const resolve = createResolveEffectiveRulesUseCase()
	return resolve(input)
}
