// src/application/inventory/InventoryBootstrapService.ts

import { db, DailyInventory } from "astro:db"

export class InventoryBootstrapService {
	async bootstrap(params: {
		variantId: string
		startDate: string
		days: number
		totalInventory: number
	}) {
		const start = new Date(params.startDate)

		for (let i = 0; i < params.days; i++) {
			const date = new Date(start)
			date.setDate(start.getDate() + i)

			await db.insert(DailyInventory).values({
				variantId: params.variantId,
				date: date.toISOString().split("T")[0],
				totalInventory: params.totalInventory,
				reservedCount: 0,
				createdAt: new Date(),
			})
		}
	}
}
