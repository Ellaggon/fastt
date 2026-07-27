import {
	and,
	DailyInventory,
	db,
	EffectiveAvailability,
	eq,
	gt,
	gte,
	InventoryLock,
	lt,
	ProviderExternalCalendarEvent,
	sql,
} from "@/shared/infrastructure/db/compat"

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
			})
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, params.variantId),
					gte(DailyInventory.date, params.from),
					lt(DailyInventory.date, params.to)
				)
			)

		return rows.map((row) => ({
			date: String(row.date),
			totalInventory: Number(row.totalInventory ?? 0),
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

		return rows.map((row) => ({
			date: String(row.date),
			quantity: Number(row.quantity ?? 0),
			expiresAt: new Date(row.expiresAt),
			bookingId: row.bookingId == null ? null : String(row.bookingId),
		}))
	}

	async loadExternalCalendarBlocksRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<Array<{ date: string; quantity: number }>> {
		const rows = await db
			.select({
				id: ProviderExternalCalendarEvent.id,
				calendarId: ProviderExternalCalendarEvent.calendarId,
				resourceId: ProviderExternalCalendarEvent.resourceId,
				startDate: ProviderExternalCalendarEvent.startDate,
				endDate: ProviderExternalCalendarEvent.endDate,
			})
			.from(ProviderExternalCalendarEvent)
			.where(
				and(
					eq(ProviderExternalCalendarEvent.variantId, params.variantId),
					eq(ProviderExternalCalendarEvent.isActive, true),
					lt(ProviderExternalCalendarEvent.startDate, params.to),
					gt(ProviderExternalCalendarEvent.endDate, params.from)
				)
			)

		const byDate = new Map<string, number>()
		const unitsByDate = new Map<string, Set<string>>()
		for (const row of rows) {
			const cursor = new Date(`${String(row.startDate)}T00:00:00.000Z`)
			const eventEnd = new Date(`${String(row.endDate)}T00:00:00.000Z`)
			const rangeStart = new Date(`${params.from}T00:00:00.000Z`)
			const rangeEnd = new Date(`${params.to}T00:00:00.000Z`)
			if (cursor < rangeStart) cursor.setTime(rangeStart.getTime())
			const end = eventEnd < rangeEnd ? eventEnd : rangeEnd
			while (cursor < end) {
				const date = cursor.toISOString().slice(0, 10)
				const unitKey = row.resourceId
					? `resource:${String(row.resourceId)}`
					: `event:${String(row.calendarId)}:${String(row.id)}`
				const units = unitsByDate.get(date) ?? new Set<string>()
				units.add(unitKey)
				unitsByDate.set(date, units)
				cursor.setUTCDate(cursor.getUTCDate() + 1)
			}
		}
		for (const [date, units] of unitsByDate) byDate.set(date, units.size)
		return [...byDate].map(([date, quantity]) => ({ date, quantity }))
	}

	async upsertEffectiveAvailabilityRows(rows: EffectiveAvailabilityUpsertRow[]): Promise<void> {
		if (rows.length === 0) return
		await db
			.insert(EffectiveAvailability)
			.values(rows as any)
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					totalUnits: sql.raw('excluded."totalUnits"'),
					heldUnits: sql.raw('excluded."heldUnits"'),
					bookedUnits: sql.raw('excluded."bookedUnits"'),
					externalBlockedUnits: sql.raw('excluded."externalBlockedUnits"'),
					availableUnits: sql.raw('excluded."availableUnits"'),
					computedAt: sql.raw('excluded."computedAt"'),
				},
			})
	}
}
