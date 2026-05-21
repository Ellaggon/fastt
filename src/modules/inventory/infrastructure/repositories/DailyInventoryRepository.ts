import { toISODate } from "@/shared/domain/date/date.utils"
import { db, DailyInventory, eq, and, gte, lt } from "astro:db"
import type { DailyInventoryRepositoryPort } from "../../application/ports/DailyInventoryRepositoryPort"

export class DailyInventoryRepository implements DailyInventoryRepositoryPort {
	async getRange(variantId: string, checkIn: Date, checkOut: Date) {
		const start = toISODate(checkIn)
		const end = toISODate(checkOut)

		const rows = await db
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

		// Critical: never allow missing days to be interpreted as available.
		// We synthesize missing dates as 0 inventory, so search/availability gates correctly.
		const byDate = new Map<string, any>(rows.map((r: any) => [String(r.date), r]))

		const out: any[] = []
		const cursor = new Date(checkIn)
		while (toISODate(cursor) < end) {
			const iso = toISODate(cursor)
			const existing = byDate.get(iso)
			if (existing) {
				out.push(existing)
			} else {
				out.push({
					date: iso,
					variantId,
					totalInventory: 0,
					reservedCount: 0,
					// Deprecated ARI compatibility only. Missing physical inventory is
					// represented by totalInventory=0; sellability belongs to Restrictions.
					stopSell: false,
				})
			}
			cursor.setDate(cursor.getDate() + 1)
		}

		return out
	}

	/**
	 * Inventory calendar writes MUST NOT overwrite reservedCount.
	 * Canonical writes update physical totalInventory. stopSell remains accepted
	 * in the input shape only as deprecated payload compatibility and is not
	 * persisted as commercial state.
	 */
	async upsertOperational(row: {
		variantId: string
		date: string
		totalInventory?: number
		stopSell?: boolean
	}): Promise<void> {
		const date = typeof row.date === "string" ? row.date : toISODate(row.date as any)

		const insertTotal = Number.isFinite(row.totalInventory as any) ? Number(row.totalInventory) : 0

		const set: Record<string, any> = { updatedAt: new Date() }
		if (row.totalInventory !== undefined) set.totalInventory = insertTotal

		await db
			.insert(DailyInventory)
			.values({
				id: `di_${crypto.randomUUID()}`,
				variantId: row.variantId,
				date,
				totalInventory: insertTotal,
				reservedCount: 0,
				stopSell: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [DailyInventory.variantId, DailyInventory.date],
				set,
			})
	}

	async bulkUpsertOperational(params: {
		variantId: string
		startDate: Date
		endDate: Date
		totalInventory?: number
		stopSell?: boolean
	}): Promise<void> {
		const end = toISODate(params.endDate)
		const cursor = new Date(params.startDate)
		while (toISODate(cursor) < end) {
			await this.upsertOperational({
				variantId: params.variantId,
				date: toISODate(cursor),
				totalInventory: params.totalInventory,
				stopSell: params.stopSell,
			})
			cursor.setDate(cursor.getDate() + 1)
		}
	}

	async upsert(row: {
		id: string
		variantId: string
		date: string
		totalInventory: number
		reservedCount: number
	}): Promise<void> {
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
				},
			})
	}
}
