import { db, eq, HouseRule as HouseRuleTable } from "astro:db"

import type { HouseRuleType } from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../../application/ports/HouseRuleRepositoryPort"

export class HouseRuleRepository implements HouseRuleRepositoryPort {
	async create(rule: {
		id: string
		productId: string
		type: HouseRuleType
		description: string
		createdAt: Date
	}) {
		await db.insert(HouseRuleTable).values({
			id: rule.id,
			productId: rule.productId,
			type: rule.type,
			description: rule.description,
			createdAt: rule.createdAt,
		})
	}

	async listByProduct(productId: string) {
		return db
			.select()
			.from(HouseRuleTable)
			.where(eq(HouseRuleTable.productId, productId))
			.all() as any
	}

	async delete(id: string) {
		await db.delete(HouseRuleTable).where(eq(HouseRuleTable.id, id)).run()
	}
}
