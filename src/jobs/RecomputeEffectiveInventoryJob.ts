// src/jobs/RecomputeEffectiveInventoryJob.ts

import { db, DailyInventory } from "astro:db"
import { RecomputeInventoryService } from "@/modules/inventory/infrastructure/services/RecomputeInventoryService"

export async function runInventoryRecomputeJob() {
	const service = new RecomputeInventoryService()

	const rows = await db.select().from(DailyInventory)

	for (const row of rows) {
		await service.recompute(row.variantId, row.date)
	}
}
