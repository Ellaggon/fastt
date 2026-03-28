import { createHouseRule } from "@/modules/house-rules/application/use-cases/create-house-rule"
import { deleteHouseRule } from "@/modules/house-rules/application/use-cases/delete-house-rule"
import { listHouseRulesByProduct } from "@/modules/house-rules/application/use-cases/list-house-rules-by-product"
import { HouseRuleRepository } from "@/modules/house-rules/infrastructure/repositories/HouseRuleRepository"

const repo = new HouseRuleRepository()

export async function createHouseRuleUseCase(input: Parameters<typeof createHouseRule>[1]) {
	return createHouseRule({ repo }, input)
}

export async function listHouseRulesByProductUseCase(productId: string) {
	return listHouseRulesByProduct({ repo }, productId)
}

export async function deleteHouseRuleUseCase(id: string) {
	return deleteHouseRule({ repo }, id)
}
