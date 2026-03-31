// Source: legacy implementation from src/core/inventory/RecomputeInventoryService.ts

import { db, eq, and, DailyInventory, EffectiveInventory } from "astro:db"
import { recomputeInventory } from "../../application/use-cases/recompute-inventory"

export class RecomputeInventoryService {
	async recompute(variantId: string, date: string, tx = db /* permite usar transacción */) {
		const daily = await tx
			.select()
			.from(DailyInventory)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, date)))
			.get()

		if (!daily) return

		const available = recomputeInventory({
			totalInventory: daily.totalInventory,
			reservedCount: daily.reservedCount,
		})

		await tx
			.insert(EffectiveInventory)
			.values({
				variantId,
				date,
				availableInventory: available,
				computedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [EffectiveInventory.variantId, EffectiveInventory.date],
				set: {
					availableInventory: available,
					computedAt: new Date(),
				},
			})
	}
}
