import { db, eq, HouseRule as HouseRuleTable } from "astro:db"

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
			.all()

		return rows as any
	}

	async delete(id: string) {
		await db.delete(HouseRuleTable).where(eq(HouseRuleTable.id, id)).run()
	}
}
