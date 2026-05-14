import { and, desc, eq, RefundHandoffRecord as RefundHandoffTable, db } from "astro:db"

import type {
	RefundHandoffCreateInput,
	RefundHandoffRepositoryPort,
} from "../../application/ports/FinancialWorkflowRepositoryPort"
import type { RefundHandoffRecord } from "../../domain/refund-handoff-record"

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
			.get()
		return row ? map(row) : null
	}

	async findByBookingId(bookingId: string): Promise<RefundHandoffRecord[]> {
		const rows = await db
			.select()
			.from(RefundHandoffTable)
			.where(eq(RefundHandoffTable.bookingId, bookingId))
			.orderBy(desc(RefundHandoffTable.openedAt))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: RefundHandoffCreateInput): Promise<{
		handoff: RefundHandoffRecord
		created: boolean
	}> {
		const existing = (await this.findByBookingId(input.bookingId)).find(
			(row) => row.status !== "closed" && row.status !== "dismissed"
		)
		if (existing) return { handoff: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		await db
			.insert(RefundHandoffTable)
			.values(row as any)
			.run()
		return { handoff: map(row), created: true }
	}

	async acknowledge(params: {
		id: string
		providerId: string
		acknowledgedAt: Date
	}): Promise<RefundHandoffRecord | null> {
		const existing = await this.findByIdForProvider(params.id, params.providerId)
		if (!existing) return null
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
			.run()
		return this.findByIdForProvider(params.id, params.providerId)
	}
}
