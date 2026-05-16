import { and, db, desc, eq, inArray, PayoutRecord as PayoutRecordTable } from "astro:db"

import type {
	PayoutRecordCreateInput,
	PayoutRecordRepositoryPort,
} from "../../application/ports/ProviderFinanceRepositoryPort"
import type { PayoutRecord } from "../../domain/payout-record"

function map(row: any): PayoutRecord {
	return {
		id: String(row.id),
		bookingId: row.bookingId ?? null,
		providerId: String(row.providerId),
		status: String(row.status) as PayoutRecord["status"],
		payoutReference: row.payoutReference ?? null,
		amount: row.amount == null ? null : Number(row.amount),
		currency: row.currency ? String(row.currency).toUpperCase() : null,
		basis: String(row.basis) as PayoutRecord["basis"],
		recordedAt: row.recordedAt ? new Date(row.recordedAt) : null,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class PayoutRecordRepository implements PayoutRecordRepositoryPort {
	async findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<PayoutRecord[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(PayoutRecordTable.providerId, providerId)]
		const bookingIds = Array.from(new Set((params.bookingIds ?? []).map(String).filter(Boolean)))
		if (bookingIds.length) filters.push(inArray(PayoutRecordTable.bookingId, bookingIds))
		const rows = await db
			.select()
			.from(PayoutRecordTable)
			.where(and(...filters))
			.orderBy(desc(PayoutRecordTable.updatedAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: PayoutRecordCreateInput): Promise<{
		record: PayoutRecord
		created: boolean
	}> {
		const existing = input.bookingId
			? (
					await this.findByProvider({
						providerId: input.providerId,
						bookingIds: [input.bookingId],
						limit: 1,
					})
				)[0]
			: null
		if (existing) return { record: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		await db
			.insert(PayoutRecordTable)
			.values(row as any)
			.run()
		return { record: map(row), created: true }
	}
}
