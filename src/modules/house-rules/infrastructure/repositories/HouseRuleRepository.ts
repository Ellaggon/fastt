import { db, eq, HouseRule as HouseRuleTable, inArray } from "@/shared/infrastructure/db/compat"

import type { HouseRulePayload, HouseRuleType } from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../../application/ports/HouseRuleRepositoryPort"

export class HouseRuleRepository implements HouseRuleRepositoryPort {
	async create(rule: {
		id: string
		productId: string
		type: HouseRuleType
		payloadJson: HouseRulePayload
		createdAt: Date
	}) {
		await db.insert(HouseRuleTable).values({
			id: rule.id,
			productId: rule.productId,
			type: rule.type,
			payloadJson: rule.payloadJson,
			createdAt: rule.createdAt,
		})
	}

	async listByProduct(productId: string) {
		const rows = await db
			.select({
				id: HouseRuleTable.id,
				productId: HouseRuleTable.productId,
				type: HouseRuleTable.type,
				payloadJson: HouseRuleTable.payloadJson,
				createdAt: HouseRuleTable.createdAt,
			})
			.from(HouseRuleTable)
			.where(eq(HouseRuleTable.productId, productId))

		return rows as any
	}

	async listByProductIds(productIds: string[]) {
		const ids = Array.from(
			new Set(productIds.map((productId) => String(productId ?? "").trim()).filter(Boolean))
		)
		if (!ids.length) return []

		const rows = await db
			.select({
				id: HouseRuleTable.id,
				productId: HouseRuleTable.productId,
				type: HouseRuleTable.type,
				payloadJson: HouseRuleTable.payloadJson,
				createdAt: HouseRuleTable.createdAt,
			})
			.from(HouseRuleTable)
			.where(inArray(HouseRuleTable.productId, ids))

		return rows as any
	}

	async delete(id: string) {
		await db.delete(HouseRuleTable).where(eq(HouseRuleTable.id, id))
	}
}
