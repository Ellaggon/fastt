import {
	and,
	DailyInventory,
	db,
	EffectiveAvailability,
	eq,
	gte,
	InventoryLock,
	lt,
	sql,
} from "astro:db"

import type {
	DailyInventoryRow,
	EffectiveAvailabilityUpsertRow,
	InventoryLockRow,
	InventoryRecomputeRepositoryPort,
} from "@/modules/inventory/application/ports/InventoryRecomputeRepositoryPort"

export class InventoryRecomputeRepository implements InventoryRecomputeRepositoryPort {
	async loadDailyInventoryRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<DailyInventoryRow[]> {
		const rows = await db
			.select({
				date: DailyInventory.date,
				totalInventory: DailyInventory.totalInventory,
				stopSell: DailyInventory.stopSell,
			})
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, params.variantId),
					gte(DailyInventory.date, params.from),
					lt(DailyInventory.date, params.to)
				)
			)
			.all()

		return rows.map((row) => ({
			date: String(row.date),
			totalInventory: Number(row.totalInventory ?? 0),
			stopSell: Boolean(row.stopSell),
		}))
	}

	async loadInventoryLocksRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<InventoryLockRow[]> {
		const rows = await db
			.select({
				date: InventoryLock.date,
				quantity: InventoryLock.quantity,
				expiresAt: InventoryLock.expiresAt,
				bookingId: InventoryLock.bookingId,
			})
			.from(InventoryLock)
			.where(
				and(
					eq(InventoryLock.variantId, params.variantId),
					gte(InventoryLock.date, params.from),
					lt(InventoryLock.date, params.to),
					sql`${InventoryLock.holdId} is not null`
				)
			)
			.all()

		return rows.map((row) => ({
			date: String(row.date),
			quantity: Number(row.quantity ?? 0),
			expiresAt: new Date(row.expiresAt),
			bookingId: row.bookingId == null ? null : String(row.bookingId),
		}))
	}

	async upsertEffectiveAvailabilityRows(rows: EffectiveAvailabilityUpsertRow[]): Promise<void> {
		if (rows.length === 0) return
		await db
			.insert(EffectiveAvailability)
			.values(rows as any)
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					totalUnits: sql`excluded.totalUnits`,
					heldUnits: sql`excluded.heldUnits`,
					bookedUnits: sql`excluded.bookedUnits`,
					availableUnits: sql`excluded.availableUnits`,
					stopSell: sql`excluded.stopSell`,
					isSellable: sql`excluded.isSellable`,
					computedAt: sql`excluded.computedAt`,
				},
			})
			.run()
	}
}
