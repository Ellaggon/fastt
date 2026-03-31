// Public API for House Rules (CAPA 6.5).
// External consumers MUST import from "@/modules/house-rules/public".

export * from "./domain/houseRule"

export async function createHouseRule(params: {
	productId: string
	type: string
	description: string
}) {
	const { createHouseRuleUseCase } = await import("@/container/house-rules.container")
	return createHouseRuleUseCase(params as any)
}

export async function listHouseRulesByProduct(productId: string) {
	const { listHouseRulesByProductUseCase } = await import("@/container/house-rules.container")
	return listHouseRulesByProductUseCase(productId)
}

export async function deleteHouseRule(id: string) {
	const { deleteHouseRuleUseCase } = await import("@/container/house-rules.container")
	return deleteHouseRuleUseCase(id)
}
