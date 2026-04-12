import { db, EffectiveAvailability } from "astro:db"
import type { InventoryRepositoryPort } from "../../application/ports/InventoryRepositoryPort"

export class InventoryRepository implements InventoryRepositoryPort {
	async upsertEffectiveInventory(row: {
		variantId: string
		date: string
		availableInventory: number
		computedAt: Date
	}): Promise<void> {
		await db
			.insert(EffectiveAvailability)
			.values({
				variantId: row.variantId,
				date: row.date,
				availableInventory: row.availableInventory,
				computedAt: row.computedAt,
			})
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					availableInventory: row.availableInventory,
					computedAt: row.computedAt,
				},
			})
	}
}
