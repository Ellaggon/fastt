// src/repositories/AvailabilityRepository.ts

import { toISODate } from "@/core/date/date.utils"
import { db, DailyInventory, eq, and, gte, lt } from "astro:db"

export class DailyInventoryRepository {
	async getRange(variantId: string, checkIn: Date, checkOut: Date) {
		const start = toISODate(checkIn)
		const end = toISODate(checkOut)

		return db
			.select()
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, variantId),
					gte(DailyInventory.date, start),
					lt(DailyInventory.date, end)
				)
			)
			.all()
	}

	async upsert(row: typeof DailyInventory.$inferInsert) {
		const data = {
			...row,
			date: typeof row.date === "string" ? row.date : toISODate(row.date),
		}

		await db
			.insert(DailyInventory)
			.values(data)
			.onConflictDoUpdate({
				target: [DailyInventory.variantId, DailyInventory.date],
				set: {
					totalInventory: data.totalInventory,
					reservedCount: data.reservedCount,
					priceOverride: data.priceOverride,
				},
			})
	}
}
