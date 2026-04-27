import { db, DailyInventory, Hold, InventoryLock, and, eq, gte, lt, sql } from "astro:db"
import { toISODate } from "@/shared/domain/date/date.utils"
import { logger } from "@/lib/observability/logger"
import type {
	HoldInventoryResult,
	InventoryHoldRepositoryPort,
} from "../../application/ports/InventoryHoldRepositoryPort"

class NotAvailableError extends Error {
	constructor() {
		super("not_available")
	}
}

function isSqliteBusy(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e)
	const code = (e as any)?.code
	return code === "SQLITE_BUSY" || msg.includes("SQLITE_BUSY") || msg.includes("database is locked")
}

function isUniqueHoldConflict(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e)
	return msg.includes("UNIQUE constraint failed: Hold.id")
}

function isMissingHoldTableError(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e)
	return msg.includes("no such table: Hold")
}

async function sleep(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms))
}

function datesInRange(checkIn: Date, checkOut: Date): string[] {
	const start = toISODate(checkIn)
	const end = toISODate(checkOut)
	const out: string[] = []
	const cursor = new Date(checkIn)
	while (toISODate(cursor) < end) {
		out.push(toISODate(cursor))
		cursor.setDate(cursor.getDate() + 1)
	}
	// Ensure we never return empty for invalid ranges; caller validates.
	return out.filter((d) => d >= start && d < end)
}

function toExclusiveDate(isoDate: string): string {
	const start = new Date(`${isoDate}T00:00:00.000Z`)
	start.setUTCDate(start.getUTCDate() + 1)
	return start.toISOString().slice(0, 10)
}

export class InventoryHoldRepository implements InventoryHoldRepositoryPort {
	async findActiveHold(params: {
		holdId: string
		now: Date
	}): Promise<{ holdId: string; expiresAt: Date } | null> {
		const row = await db
			.select({
				holdId: InventoryLock.holdId,
				expiresAt: InventoryLock.expiresAt,
			})
			.from(InventoryLock)
			.where(
				and(
					eq(InventoryLock.holdId, params.holdId),
					gte(InventoryLock.expiresAt, params.now),
					sql`${InventoryLock.bookingId} is null`
				)
			)
			.get()

		if (!row?.holdId || !row.expiresAt) return null
		return {
			holdId: String(row.holdId),
			expiresAt: new Date(row.expiresAt),
		}
	}

	async holdInventory(params: {
		holdId: string
		variantId: string
		ratePlanId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		expiresAt: Date
		channel?: string | null
		policySnapshotJson: unknown
	}): Promise<HoldInventoryResult> {
		const maxAttempts = 5
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await db.transaction(async (tx) => {
					const dates = datesInRange(params.checkIn, params.checkOut)
					if (!dates.length) throw new NotAvailableError()

					try {
						await tx
							.insert(Hold)
							.values({
								id: params.holdId,
								variantId: params.variantId,
								ratePlanId: params.ratePlanId == null ? null : String(params.ratePlanId),
								checkIn: toISODate(params.checkIn),
								checkOut: toISODate(params.checkOut),
								channel: params.channel == null ? null : String(params.channel),
								expiresAt: params.expiresAt,
								policySnapshotJson: params.policySnapshotJson as any,
								createdAt: new Date(),
							} as any)
							.run()
					} catch (e) {
						if (!isMissingHoldTableError(e)) throw e
						logger.warn("inventory.hold.table_missing", {
							holdId: params.holdId,
							variantId: params.variantId,
						})
					}

					for (const date of dates) {
						// Ensure daily row exists; missing dates are not available.
						const daily = await tx
							.select({
								totalInventory: DailyInventory.totalInventory,
								reservedCount: DailyInventory.reservedCount,
								stopSell: DailyInventory.stopSell,
							})
							.from(DailyInventory)
							.where(
								and(eq(DailyInventory.variantId, params.variantId), eq(DailyInventory.date, date))
							)
							.get()

						if (!daily) throw new NotAvailableError()
						if (Boolean((daily as any).stopSell)) throw new NotAvailableError()
						const totalInventory = Number(daily.totalInventory ?? 0)
						const reservedCount = Number(daily.reservedCount ?? 0)
						if (!Number.isFinite(totalInventory) || !Number.isFinite(reservedCount)) {
							throw new NotAvailableError()
						}
						if (totalInventory < 0 || reservedCount < 0) {
							throw new NotAvailableError()
						}
						const lockAgg = await tx
							.select({
								heldUnits: sql<number>`coalesce(sum(case when ${InventoryLock.bookingId} is null and ${InventoryLock.expiresAt} > ${new Date()} then ${InventoryLock.quantity} else 0 end), 0)`,
								bookedUnits: sql<number>`coalesce(sum(case when ${InventoryLock.bookingId} is not null then ${InventoryLock.quantity} else 0 end), 0)`,
							})
							.from(InventoryLock)
							.where(
								and(eq(InventoryLock.variantId, params.variantId), eq(InventoryLock.date, date))
							)
							.get()
						const heldUnits = Number((lockAgg as any)?.heldUnits ?? 0)
						const bookedUnits = Number((lockAgg as any)?.bookedUnits ?? 0)
						if (
							!Number.isFinite(heldUnits) ||
							!Number.isFinite(bookedUnits) ||
							heldUnits < 0 ||
							bookedUnits < 0
						) {
							throw new NotAvailableError()
						}
						if (heldUnits + bookedUnits + params.quantity > totalInventory) {
							throw new NotAvailableError()
						}
						if (reservedCount + params.quantity > totalInventory) {
							throw new NotAvailableError()
						}

						// Atomic increment guarded by capacity constraint (prevents overbooking under concurrency).
						const res = await tx
							.update(DailyInventory)
							.set({
								reservedCount: sql`${DailyInventory.reservedCount} + ${params.quantity}`,
							} as any)
							.where(
								and(
									eq(DailyInventory.variantId, params.variantId),
									eq(DailyInventory.date, date),
									sql`${DailyInventory.reservedCount} + ${params.quantity} <= ${DailyInventory.totalInventory}`
								)
							)
							.run()

						// libsql/drizzle run() uses `rowsAffected`; sqlite drivers often use `changes`.
						const affected = Number((res as any)?.rowsAffected ?? (res as any)?.changes ?? 0)
						if (affected !== 1) throw new NotAvailableError()

						await tx
							.insert(InventoryLock)
							.values({
								id: crypto.randomUUID(),
								holdId: params.holdId,
								variantId: params.variantId,
								date,
								quantity: params.quantity,
								expiresAt: params.expiresAt,
								bookingId: null,
								createdAt: new Date(),
							} as any)
							.run()
					}
				})

				return { success: true, holdId: params.holdId, expiresAt: params.expiresAt }
			} catch (e) {
				if (e instanceof NotAvailableError) {
					return { success: false, reason: "not_available" }
				}
				if (isUniqueHoldConflict(e)) {
					return { success: false, reason: "not_available" }
				}
				if (isSqliteBusy(e)) {
					if (attempt < maxAttempts) {
						await sleep(10 * attempt)
						continue
					}
					return { success: false, reason: "not_available" }
				}
				throw e
			}
		}

		return { success: false, reason: "not_available" }
	}

	async findHoldSnapshot(params: {
		holdId: string
	}): Promise<{ policySnapshotJson: unknown } | null> {
		const id = String(params.holdId ?? "").trim()
		if (!id) return null
		let row: { policySnapshotJson: unknown } | undefined
		try {
			row = await db
				.select({ policySnapshotJson: Hold.policySnapshotJson })
				.from(Hold)
				.where(eq(Hold.id, id))
				.get()
		} catch (e) {
			if (!isMissingHoldTableError(e)) throw e
			return null
		}
		if (!row) return null
		return { policySnapshotJson: row.policySnapshotJson }
	}

	async releaseHold(params: { holdId: string }): Promise<{ released: boolean; days: number }> {
		const maxAttempts = 5
		let released = false
		let days = 0
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await db.transaction(async (tx) => {
					// IMPORTANT: select inside the write transaction so concurrent callers can't
					// double-decrement reservedCount with a stale pre-read lock list.
					const locks = await tx
						.select({
							id: InventoryLock.id,
							variantId: InventoryLock.variantId,
							date: InventoryLock.date,
							quantity: InventoryLock.quantity,
						})
						.from(InventoryLock)
						.where(
							and(eq(InventoryLock.holdId, params.holdId), sql`${InventoryLock.bookingId} is null`)
						)
						.all()

					if (!locks.length) {
						released = false
						days = 0
						return
					}

					for (const l of locks) {
						await tx
							.update(DailyInventory)
							.set({
								reservedCount: sql`max(0, ${DailyInventory.reservedCount} - ${Number(l.quantity)})`,
							} as any)
							.where(
								and(
									eq(DailyInventory.variantId, l.variantId),
									eq(DailyInventory.date, String(l.date))
								)
							)
							.run()
					}

					await tx
						.delete(InventoryLock)
						.where(
							and(eq(InventoryLock.holdId, params.holdId), sql`${InventoryLock.bookingId} is null`)
						)
						.run()

					released = true
					days = locks.length
				})
				break
			} catch (e) {
				if (isSqliteBusy(e) && attempt < maxAttempts) {
					await sleep(10 * attempt)
					continue
				}
				throw e
			}
		}

		return { released, days }
	}

	async listExpiredHolds(params: {
		now: Date
	}): Promise<Array<{ holdId: string; variantId: string; from: string; to: string }>> {
		const rows = await db
			.select({
				holdId: InventoryLock.holdId,
				variantId: InventoryLock.variantId,
				date: InventoryLock.date,
			})
			.from(InventoryLock)
			.where(
				and(
					lt(InventoryLock.expiresAt, params.now),
					sql`${InventoryLock.holdId} is not null`,
					sql`${InventoryLock.bookingId} is null`
				)
			)
			.all()

		const map = new Map<
			string,
			{ holdId: string; variantId: string; from: string; lastDate: string }
		>()
		for (const r of rows) {
			const id = String((r as any).holdId || "").trim()
			const variantId = String((r as any).variantId || "").trim()
			const date = String((r as any).date || "").trim()
			if (!id || !variantId || !date) continue

			const key = `${id}:${variantId}`
			const existing = map.get(key)
			if (!existing) {
				map.set(key, { holdId: id, variantId, from: date, lastDate: date })
				continue
			}
			if (date < existing.from) existing.from = date
			if (date > existing.lastDate) existing.lastDate = date
		}
		return [...map.values()].map((entry) => ({
			holdId: entry.holdId,
			variantId: entry.variantId,
			from: entry.from,
			to: toExclusiveDate(entry.lastDate),
		}))
	}
}
