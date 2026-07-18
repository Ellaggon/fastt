import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/application/use-cases/build-guest-stay-expectations-snapshot"
import { createHouseRule } from "@/modules/house-rules/application/use-cases/create-house-rule"
import { deleteHouseRule } from "@/modules/house-rules/application/use-cases/delete-house-rule"
import {
	listHouseRulesByProduct,
	listHouseRulesByProductIds,
} from "@/modules/house-rules/application/use-cases/list-house-rules-by-product"
import { HouseRuleRepository } from "@/modules/house-rules/infrastructure/repositories/HouseRuleRepository"

const repo = new HouseRuleRepository()

export async function createHouseRuleUseCase(input: Parameters<typeof createHouseRule>[1]) {
	return createHouseRule({ repo }, input)
}

export async function listHouseRulesByProductUseCase(productId: string) {
	return listHouseRulesByProduct({ repo }, productId)
}

export async function listHouseRulesByProductIdsUseCase(productIds: string[]) {
	return listHouseRulesByProductIds({ repo }, productIds)
}

export async function buildGuestStayExpectationsSnapshotUseCase(
	productId: string,
	options?: { capturedAt?: Date }
) {
	return buildGuestStayExpectationsSnapshot({ repo }, productId, options)
}

export async function deleteHouseRuleUseCase(id: string) {
	return deleteHouseRule({ repo }, id)
}
