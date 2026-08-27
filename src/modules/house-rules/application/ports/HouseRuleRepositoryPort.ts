import type { HouseRulePayload, HouseRuleScope, HouseRuleType } from "../../domain/houseRule"

export type HouseRuleRecord = {
	id: string
	productId: string
	scope: HouseRuleScope
	scopeId: string | null
	type: HouseRuleType
	payloadJson: HouseRulePayload
	createdAt: Date
}

export interface HouseRuleRepositoryPort {
	create(rule: {
		id: string
		productId: string
		scope: HouseRuleScope
		scopeId: string | null
		type: HouseRuleType
		payloadJson: HouseRulePayload
		createdAt: Date
	}): Promise<void>
	updatePayload(id: string, payloadJson: HouseRulePayload): Promise<void>
	findByIdentity(params: {
		productId: string
		scope: HouseRuleScope
		scopeId: string | null
		type: HouseRuleType
	}): Promise<HouseRuleRecord | null>
	listByProduct(productId: string): Promise<HouseRuleRecord[]>
	listByProductIds(productIds: string[]): Promise<HouseRuleRecord[]>
	listVariantOverrides(productId: string, variantId: string): Promise<HouseRuleRecord[]>
	hotelRoomBelongsToProduct(productId: string, variantId: string): Promise<boolean>
	delete(id: string): Promise<void>
}
