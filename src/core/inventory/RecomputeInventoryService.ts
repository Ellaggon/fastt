// src/core/inventory/RecomputeInventoryService.ts

import { db, eq, and, DailyInventory, EffectiveInventory } from "astro:db"

export class RecomputeInventoryService {
	async recompute(
		variantId: string,
		date: string,
		tx = db // permite usar transacción
	) {
		const daily = await tx
			.select()
			.from(DailyInventory)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, date)))
			.get()

		if (!daily) return

		const available = Math.max(0, daily.totalInventory - daily.reservedCount)

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
