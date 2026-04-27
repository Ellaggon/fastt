// Source: legacy implementation from src/core/inventory/InventoryBootstrapService.ts

import { db, DailyInventory, eq } from "astro:db"

export class InventoryBootstrapService {
	async bootstrap(params: { variantId: string; totalInventory: number; days?: number }) {
		const now = new Date()
		const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
		const days = params.days ?? 365

		// 1️⃣ Traer inventario existente de una vez
		const existingRows = await db
			.select()
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, params.variantId))

		const existingDates = new Set(
			existingRows.map((r) => {
				if (typeof r.date === "string") return r.date.slice(0, 10)
				return new Date(r.date).toISOString().slice(0, 10)
			})
		)
		const scheduledDates = new Set<string>()

		const inserts: (typeof DailyInventory.$inferInsert)[] = []
		const updates: string[] = []

		for (let i = 0; i < days; i++) {
			const date = new Date(todayUtc)
			date.setUTCDate(todayUtc.getUTCDate() + i)
			const iso = date.toISOString().slice(0, 10)

			if (!existingDates.has(iso) && !scheduledDates.has(iso)) {
				scheduledDates.add(iso)
				inserts.push({
					id: crypto.randomUUID(),
					variantId: params.variantId,
					date: iso,
					totalInventory: params.totalInventory,
					reservedCount: 0,
					createdAt: new Date(),
				})
			} else {
				updates.push(iso)
			}
		}

		// 2️⃣ Batch insert
		if (inserts.length > 0) {
			await db.insert(DailyInventory).values(inserts)
		}

		// 3️⃣ Batch update (si cambió totalRooms)
		if (updates.length > 0) {
			await db
				.update(DailyInventory)
				.set({ totalInventory: params.totalInventory })
				.where(eq(DailyInventory.variantId, params.variantId))
		}
	}
}
