import { db, DailyInventory, InventoryLock, and, eq, lt, sql } from "astro:db"
import { toISODate } from "@/shared/domain/date/date.utils"
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

export class InventoryHoldRepository implements InventoryHoldRepositoryPort {
	async holdInventory(params: {
		holdId: string
		variantId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		expiresAt: Date
	}): Promise<HoldInventoryResult> {
		const maxAttempts = 5
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await db.transaction(async (tx) => {
					const dates = datesInRange(params.checkIn, params.checkOut)
					if (!dates.length) throw new NotAvailableError()

					for (const date of dates) {
						// Ensure daily row exists; missing dates are not available.
						const daily = await tx
							.select({
								totalInventory: DailyInventory.totalInventory,
								reservedCount: DailyInventory.reservedCount,
							})
							.from(DailyInventory)
							.where(
								and(eq(DailyInventory.variantId, params.variantId), eq(DailyInventory.date, date))
							)
							.get()

						if (!daily) throw new NotAvailableError()
						if (Number(daily.reservedCount) + params.quantity > Number(daily.totalInventory)) {
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

				return { success: true, holdId: params.holdId }
			} catch (e) {
				if (e instanceof NotAvailableError) {
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
						.where(eq(InventoryLock.holdId, params.holdId))
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

					await tx.delete(InventoryLock).where(eq(InventoryLock.holdId, params.holdId)).run()

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

	async listExpiredHoldIds(params: { now: Date }): Promise<string[]> {
		const rows = await db
			.select({ holdId: InventoryLock.holdId })
			.from(InventoryLock)
			.where(and(lt(InventoryLock.expiresAt, params.now), sql`${InventoryLock.holdId} is not null`))
			.all()

		const set = new Set<string>()
		for (const r of rows) {
			const id = String((r as any).holdId || "").trim()
			if (id) set.add(id)
		}
		return [...set]
	}
}
