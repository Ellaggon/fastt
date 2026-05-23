import type { HouseRulePayload, HouseRuleType } from "../../domain/houseRule"

export interface HouseRuleRepositoryPort {
	create(rule: {
		id: string
		productId: string
		type: HouseRuleType
		description: string
		payloadJson?: HouseRulePayload | null
		createdAt: Date
	}): Promise<void>
	listByProduct(productId: string): Promise<
		Array<{
			id: string
			productId: string
			type: HouseRuleType
			description: string
			payloadJson?: HouseRulePayload | null
			createdAt: Date
		}>
	>
	delete(id: string): Promise<void>
}
