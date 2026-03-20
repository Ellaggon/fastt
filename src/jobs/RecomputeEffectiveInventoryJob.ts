// src/jobs/RecomputeEffectiveInventoryJob.ts

import { db, DailyInventory } from "astro:db"
import { recomputeInventoryService } from "@/container"

export async function runInventoryRecomputeJob() {
	const rows = await db.select().from(DailyInventory)

	for (const row of rows) {
		await recomputeInventoryService.recompute(row.variantId, row.date)
	}
}
