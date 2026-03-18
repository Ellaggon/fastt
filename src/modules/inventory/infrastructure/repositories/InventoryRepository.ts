import { db, EffectiveInventory } from "astro:db"
import type { InventoryRepositoryPort } from "../../application/ports/InventoryRepositoryPort"

export class InventoryRepository implements InventoryRepositoryPort {
	async upsertEffectiveInventory(row: {
		variantId: string
		date: string
		availableInventory: number
		computedAt: Date
	}): Promise<void> {
		await db
			.insert(EffectiveInventory)
			.values({
				variantId: row.variantId,
				date: row.date,
				availableInventory: row.availableInventory,
				computedAt: row.computedAt,
			})
			.onConflictDoUpdate({
				target: [EffectiveInventory.variantId, EffectiveInventory.date],
				set: {
					availableInventory: row.availableInventory,
					computedAt: row.computedAt,
				},
			})
	}
}
