import type { HouseRuleType } from "../../domain/houseRule"

export interface HouseRuleRepositoryPort {
	create(rule: {
		id: string
		productId: string
		type: HouseRuleType
		description: string
		createdAt: Date
	}): Promise<void>
	listByProduct(
		productId: string
	): Promise<
		Array<{
			id: string
			productId: string
			type: HouseRuleType
			description: string
			createdAt: Date
		}>
	>
	delete(id: string): Promise<void>
}
