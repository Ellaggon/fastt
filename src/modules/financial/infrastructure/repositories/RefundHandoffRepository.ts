import {
	first,
	and,
	desc,
	eq,
	inArray,
	lt,
	or,
	RefundHandoffRecord as RefundHandoffTable,
	db,
} from "@/shared/infrastructure/db/compat"

import type {
	RefundHandoffCreateInput,
	RefundHandoffRepositoryPort,
} from "../../application/ports/FinancialWorkflowRepositoryPort"
import type { RefundHandoffRecord } from "../../domain/refund-handoff-record"

const terminalStatuses = new Set(["closed", "dismissed"])

function map(row: any): RefundHandoffRecord {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		status: String(row.status) as RefundHandoffRecord["status"],
		reason: String(row.reason) as RefundHandoffRecord["reason"],
		refundType: String(row.refundType) as RefundHandoffRecord["refundType"],
		expectedAmount: row.expectedAmount == null ? null : Number(row.expectedAmount),
		currency: row.currency ?? null,
		basis: String(row.basis) as RefundHandoffRecord["basis"],
		nextOwner: String(row.nextOwner) as RefundHandoffRecord["nextOwner"],
		openedAt: new Date(row.openedAt),
		acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt) : null,
		closedAt: row.closedAt ? new Date(row.closedAt) : null,
		notes: row.notes ?? null,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class RefundHandoffRepository implements RefundHandoffRepositoryPort {
	async findByIdForProvider(id: string, providerId: string): Promise<RefundHandoffRecord | null> {
		const row = await db
			.select()
			.from(RefundHandoffTable)
			.where(and(eq(RefundHandoffTable.id, id), eq(RefundHandoffTable.providerId, providerId)))
			.then(first)
		return row ? map(row) : null
	}

	async findByBookingId(bookingId: string): Promise<RefundHandoffRecord[]> {
		const rows = await db
			.select()
			.from(RefundHandoffTable)
			.where(eq(RefundHandoffTable.bookingId, bookingId))
			.orderBy(desc(RefundHandoffTable.openedAt))

		return rows.map(map)
	}

	async findByProvider(params?: {
		providerId: string
		bookingIds?: string[]
		status?: RefundHandoffRecord["status"] | "all"
		limit?: number
		cursor?: { openedAt: Date; id: string } | null
	}): Promise<RefundHandoffRecord[]> {
		const providerId = String(params?.providerId ?? "").trim()
		if (!providerId) return []
		const bookingIds = Array.from(new Set((params?.bookingIds || []).map(String).filter(Boolean)))
		const filters = [eq(RefundHandoffTable.providerId, providerId)]
		if (bookingIds.length) filters.push(inArray(RefundHandoffTable.bookingId, bookingIds))
		if (params?.status && params.status !== "all")
			filters.push(eq(RefundHandoffTable.status, params.status))
		if (params?.cursor) {
			filters.push(
				or(
					lt(RefundHandoffTable.openedAt, params.cursor.openedAt),
					and(
						eq(RefundHandoffTable.openedAt, params.cursor.openedAt),
						lt(RefundHandoffTable.id, params.cursor.id)
					)
				)!
			)
		}
		const rows = await db
			.select()
			.from(RefundHandoffTable)
			.where(and(...filters))
			.orderBy(desc(RefundHandoffTable.openedAt), desc(RefundHandoffTable.id))
			.limit(Math.max(1, Math.min(Number(params?.limit || 500), 1000)))

		return rows.map(map)
	}

	async findActiveByBookingId(
		bookingId: string,
		providerId: string
	): Promise<RefundHandoffRecord | null> {
		const records = await this.findByProvider({ providerId, bookingIds: [bookingId], limit: 20 })
		return records.find((row) => !terminalStatuses.has(row.status)) ?? null
	}

	async createIfAbsent(input: RefundHandoffCreateInput): Promise<{
		handoff: RefundHandoffRecord
		created: boolean
	}> {
		const existing = await this.findActiveByBookingId(input.bookingId, input.providerId)
		if (existing) return { handoff: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		await db.insert(RefundHandoffTable).values(row as any)

		return { handoff: map(row), created: true }
	}

	async createIfAbsentForBooking(input: RefundHandoffCreateInput): Promise<{
		handoff: RefundHandoffRecord
		created: boolean
	}> {
		return this.createIfAbsent(input)
	}

	async acknowledge(params: {
		id: string
		providerId: string
		acknowledgedAt: Date
	}): Promise<RefundHandoffRecord | null> {
		const existing = await this.findByIdForProvider(params.id, params.providerId)
		if (!existing) return null
		if (terminalStatuses.has(existing.status)) return null
		if (existing.status === "acknowledged") return existing
		await db
			.update(RefundHandoffTable)
			.set({
				status: "acknowledged",
				acknowledgedAt: params.acknowledgedAt,
				updatedAt: new Date(),
			} as any)
			.where(
				and(
					eq(RefundHandoffTable.id, params.id),
					eq(RefundHandoffTable.providerId, params.providerId)
				)
			)

		return this.findByIdForProvider(params.id, params.providerId)
	}

	async close(params: {
		id: string
		providerId: string
		closedAt: Date
		notes: string
		status: Extract<RefundHandoffRecord["status"], "closed" | "dismissed">
	}): Promise<RefundHandoffRecord | null> {
		const existing = await this.findByIdForProvider(params.id, params.providerId)
		if (!existing) return null
		if (terminalStatuses.has(existing.status)) return null
		await db
			.update(RefundHandoffTable)
			.set({
				status: params.status,
				closedAt: params.closedAt,
				notes: params.notes,
				updatedAt: new Date(),
			} as any)
			.where(
				and(
					eq(RefundHandoffTable.id, params.id),
					eq(RefundHandoffTable.providerId, params.providerId)
				)
			)

		return this.findByIdForProvider(params.id, params.providerId)
	}
}
