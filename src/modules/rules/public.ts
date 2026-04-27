// Public API for the canonical PropertyRule domain (foundational, read-only).
// External consumers MUST import from "@/modules/rules/public".

export * from "./domain/rule.types"
export * from "./domain/rule.entities"
export * from "./domain/rule.catalog"
export * from "./application/adapters/policy-to-rule.adapter"
export * from "./application/adapters/house-rule-to-rule.adapter"
export * from "./application/adapters/product-content-rules-to-rule.adapter"
export * from "./application/mappers/map-rules-to-policy-view-model"
export * from "./application/use-cases/build-rule-based-contract-snapshot"
export * from "./application/use-cases/build-rule-snapshot"
export * from "./application/use-cases/compare-policy-contract-vs-rule-contract"
export * from "./application/use-cases/compare-policy-and-rule-snapshots"
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
	includeProductContentRules?: boolean
}) {
	const { createResolveEffectiveRulesUseCase } = await import(
		"./application/use-cases/resolve-effective-rules"
	)
	const { ProductContentRulesRepository } = await import(
		"./infrastructure/repositories/ProductContentRulesRepository"
	)
	const resolve = createResolveEffectiveRulesUseCase({
		productContentRulesRepo: new ProductContentRulesRepository(),
	})
	return resolve(input)
}
