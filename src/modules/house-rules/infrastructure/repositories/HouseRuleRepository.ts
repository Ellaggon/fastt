import { db, eq, HouseRule as HouseRuleTable } from "astro:db"

import type { HouseRulePayload, HouseRuleType } from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../../application/ports/HouseRuleRepositoryPort"

export class HouseRuleRepository implements HouseRuleRepositoryPort {
	private isMissingPayloadJsonColumn(error: unknown) {
		const message = String(error instanceof Error ? error.message : error)
		return message.includes("payloadJson") && message.includes("no such column")
	}

	async create(rule: {
		id: string
		productId: string
		type: HouseRuleType
		description: string
		payloadJson?: HouseRulePayload | null
		createdAt: Date
	}) {
		const values = {
			id: rule.id,
			productId: rule.productId,
			type: rule.type,
			description: rule.description,
			payloadJson: rule.payloadJson ?? null,
			createdAt: rule.createdAt,
		} as any

		try {
			await db.insert(HouseRuleTable).values(values)
		} catch (error) {
			if (!this.isMissingPayloadJsonColumn(error)) throw error

			const { payloadJson: _payloadJson, ...legacyValues } = values
			await db.insert(HouseRuleTable).values(legacyValues)
		}
	}

	async listByProduct(productId: string) {
		const rows = await db
			.select({
				id: HouseRuleTable.id,
				productId: HouseRuleTable.productId,
				type: HouseRuleTable.type,
				description: HouseRuleTable.description,
				createdAt: HouseRuleTable.createdAt,
			})
			.from(HouseRuleTable)
			.where(eq(HouseRuleTable.productId, productId))
			.all()

		return rows.map((row) => ({ ...row, payloadJson: null })) as any
	}

	async delete(id: string) {
		await db.delete(HouseRuleTable).where(eq(HouseRuleTable.id, id)).run()
	}
}
