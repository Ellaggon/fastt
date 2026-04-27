import { z } from "zod"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import type {
	DailyInventoryRow,
	EffectiveAvailabilityUpsertRow,
	InventoryLockRow,
} from "../ports/InventoryRecomputeRepositoryPort"

const inputSchema = z.object({
	variantId: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
	reason: z.string().min(1),
	idempotencyKey: z.string().min(1).optional(),
})

type RecomputeInput = z.infer<typeof inputSchema>

export type RecomputeDeps = {
	loadDailyInventoryRange: (params: {
		variantId: string
		from: string
		to: string
	}) => Promise<DailyInventoryRow[]>
	loadInventoryLocksRange: (params: {
		variantId: string
		from: string
		to: string
	}) => Promise<InventoryLockRow[]>
	upsertEffectiveAvailabilityRows: (rows: EffectiveAvailabilityUpsertRow[]) => Promise<void>
	now: () => Date
}

export type RecomputeEffectiveAvailabilityRangeResult = {
	variantId: string
	from: string
	to: string
	days: number
	reason: string
	idempotencyKey: string | null
	computedAt: Date
	retries: number
}

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function enumerateDates(from: string, to: string): string[] {
	const start = parseDateOnly(from)
	const end = parseDateOnly(to)
	const out: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function buildStableRowId(variantId: string, date: string): string {
	return `ea_${variantId}_${date}`
}

function isSqliteBusyError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	const code = (error as any)?.code
	return (
		code === "SQLITE_BUSY" ||
		code === "SQLITE_BUSY_SNAPSHOT" ||
		message.includes("SQLITE_BUSY") ||
		message.includes("database is locked")
	)
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function recomputeEffectiveAvailabilityRange(
	input: RecomputeInput,
	deps: RecomputeDeps
): Promise<RecomputeEffectiveAvailabilityRangeResult> {
	const startedAt = Date.now()
	const timeoutMs = Number(process.env.INVENTORY_RECOMPUTE_TIMEOUT_MS ?? 3000)
	const parsed = inputSchema.parse(input)
	incrementCounter("inventory_recompute_total")

	const fromDate = parseDateOnly(parsed.from)
	const toDate = parseDateOnly(parsed.to)
	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
		throw new Error("invalid_date_range")
	}

	const maxAttempts = 5
	let lastError: unknown = null

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const dates = enumerateDates(parsed.from, parsed.to)
			const now = deps.now()
			const [dailyRows, lockRows] = await Promise.all([
				deps.loadDailyInventoryRange({
					variantId: parsed.variantId,
					from: parsed.from,
					to: parsed.to,
				}),
				deps.loadInventoryLocksRange({
					variantId: parsed.variantId,
					from: parsed.from,
					to: parsed.to,
				}),
			])

			const dailyByDate = new Map(
				dailyRows.map((row) => [
					row.date,
					{
						totalUnits: Math.max(0, Number(row.totalInventory ?? 0)),
						stopSell: Boolean(row.stopSell),
					},
				])
			)

			const heldByDate = new Map<string, number>()
			const bookedByDate = new Map<string, number>()
			for (const lock of lockRows) {
				const date = String(lock.date)
				const quantity = Math.max(0, Number(lock.quantity ?? 0))
				if (quantity <= 0) continue

				if (lock.bookingId) {
					bookedByDate.set(date, Number(bookedByDate.get(date) ?? 0) + quantity)
					continue
				}
				if (new Date(lock.expiresAt).getTime() > now.getTime()) {
					heldByDate.set(date, Number(heldByDate.get(date) ?? 0) + quantity)
				}
			}

			const computedAt = new Date()
			const rows: EffectiveAvailabilityUpsertRow[] = dates.map((date) => {
				const daily = dailyByDate.get(date)
				const totalUnits = daily?.totalUnits ?? 0
				const stopSell = daily?.stopSell ?? true
				const heldUnits = Math.max(0, Number(heldByDate.get(date) ?? 0))
				const bookedUnits = Math.max(0, Number(bookedByDate.get(date) ?? 0))
				const availableUnits = Math.max(0, totalUnits - heldUnits - bookedUnits)
				const isSellable = availableUnits > 0 && stopSell === false

				return {
					id: buildStableRowId(parsed.variantId, date),
					variantId: parsed.variantId,
					date,
					totalUnits,
					heldUnits,
					bookedUnits,
					availableUnits,
					stopSell,
					isSellable,
					computedAt,
				}
			})

			await deps.upsertEffectiveAvailabilityRows(rows)

			logger.info("inventory.recompute", {
				variantId: parsed.variantId,
				from: parsed.from,
				to: parsed.to,
				reason: parsed.reason,
				idempotencyKey: parsed.idempotencyKey ?? null,
				retries: attempt - 1,
				days: rows.length,
				durationMs: Date.now() - startedAt,
			})

			return {
				variantId: parsed.variantId,
				from: parsed.from,
				to: parsed.to,
				days: rows.length,
				reason: parsed.reason,
				idempotencyKey: parsed.idempotencyKey ?? null,
				computedAt,
				retries: attempt - 1,
			}
		} catch (error) {
			lastError = error
			if (Date.now() - startedAt >= timeoutMs) {
				lastError = new Error("recompute_retry_timeout")
				break
			}
			if (!isSqliteBusyError(error) || attempt >= maxAttempts) {
				break
			}
			incrementCounter("inventory_recompute_retry_total")
			incrementCounter("sqlite_busy_total", { phase: "recompute" })
			await sleep(20 * attempt)
		}
	}

	logger.error("inventory.recompute_failed", {
		variantId: parsed.variantId,
		from: parsed.from,
		to: parsed.to,
		reason: parsed.reason,
		idempotencyKey: parsed.idempotencyKey ?? null,
		durationMs: Date.now() - startedAt,
		message:
			lastError instanceof Error ? lastError.message : String(lastError ?? "recompute_failed"),
	})
	throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "recompute_failed"))
}
