// Public API for House Rules (CAPA 6.5).
// External consumers MUST import from "@/modules/house-rules/public".

export * from "./domain/houseRule"
export * from "./domain/effectiveHouseRules"
export * from "./domain/guestStayExpectationsSnapshot"

export async function createHouseRule(params: {
	productId: string
	type: string
	payload?: Record<string, unknown> | null
	scope?: string | null
	scopeId?: string | null
}) {
	const { createHouseRuleUseCase } = await import("@/container/house-rules.container")
	return createHouseRuleUseCase(params as any)
}

export async function listHouseRulesByProduct(productId: string) {
	const { listHouseRulesByProductUseCase } = await import("@/container/house-rules.container")
	return listHouseRulesByProductUseCase(productId)
}

export async function listHouseRulesByProductIds(productIds: string[]) {
	const { listHouseRulesByProductIdsUseCase } = await import("@/container/house-rules.container")
	return listHouseRulesByProductIdsUseCase(productIds)
}

export async function listEffectiveHouseRules(productId: string, variantId?: string | null) {
	const { listEffectiveHouseRulesUseCase } = await import("@/container/house-rules.container")
	return listEffectiveHouseRulesUseCase(productId, variantId)
}

export async function buildGuestStayExpectationsSnapshot(
	productId: string,
	options?: { capturedAt?: Date; variantId?: string | null }
) {
	const { buildGuestStayExpectationsSnapshotUseCase } =
		await import("@/container/house-rules.container")
	return buildGuestStayExpectationsSnapshotUseCase(productId, options)
}

export async function deleteHouseRule(id: string) {
	const { deleteHouseRuleUseCase } = await import("@/container/house-rules.container")
	return deleteHouseRuleUseCase(id)
}
