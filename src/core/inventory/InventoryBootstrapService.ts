// src/core/inventory/InventoryBootstrapService.ts

import { db, DailyInventory, eq } from "astro:db"

export class InventoryBootstrapService {
	async bootstrap(params: { variantId: string; totalInventory: number; days?: number }) {
		const today = new Date()
		const days = params.days ?? 365

		// 1️⃣ Traer inventario existente de una vez
		const existingRows = await db
			.select()
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, params.variantId))

		const existingDates = new Set(existingRows.map((r) => r.date))

		const inserts: (typeof DailyInventory.$inferInsert)[] = []
		const updates: string[] = []

		for (let i = 0; i < days; i++) {
			const date = new Date(today)
			date.setDate(today.getDate() + i)
			const iso = date.toISOString().split("T")[0]

			if (!existingDates.has(iso)) {
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

// import { db, DailyInventory, eq, and } from "astro:db"

// export class InventoryBootstrapService {
// 	async bootstrap(params: { variantId: string; totalInventory: number; days?: number }) {
// 		const today = new Date()
// 		const days = params.days ?? 365

// 		for (let i = 0; i < days; i++) {
// 			const date = new Date(today)
// 			date.setDate(today.getDate() + i)

// 			const iso = date.toISOString().split("T")[0]

// 			const existing = await db
// 				.select()
// 				.from(DailyInventory)
// 				.where(and(eq(DailyInventory.variantId, params.variantId), eq(DailyInventory.date, iso)))
// 				.get()

// 			if (!existing) {
// 				await db.insert(DailyInventory).values({
// 					id: crypto.randomUUID(),
// 					variantId: params.variantId,
// 					date: iso,
// 					totalInventory: params.totalInventory,
// 					reservedCount: 0,
// 					createdAt: new Date(),
// 				})
// 			} else {
// 				// Si cambió totalRooms → actualizar capacidad
// 				await db
// 					.update(DailyInventory)
// 					.set({
// 						totalInventory: params.totalInventory,
// 					})
// 					.where(eq(DailyInventory.id, existing.id))
// 			}
// 		}
// 	}
// }
