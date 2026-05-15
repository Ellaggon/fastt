import {
	and,
	desc,
	eq,
	FinancialSettlementRecord as FinancialSettlementRecordTable,
	db,
	inArray,
} from "astro:db"

import type {
	FinancialSettlementRecordCreateInput,
	FinancialSettlementRecordRepositoryPort,
} from "../../application/ports/FinancialStage3RepositoryPort"
import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"

function map(row: any): FinancialSettlementRecord {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		settlementReference: String(row.settlementReference),
		amount: Number(row.amount ?? 0),
		currency: String(row.currency ?? "").toUpperCase(),
		settlementDate: new Date(row.settlementDate),
		source: String(row.source) as FinancialSettlementRecord["source"],
		matchedAt: row.matchedAt ? new Date(row.matchedAt) : null,
		createdAt: new Date(row.createdAt),
	}
}

export class FinancialSettlementRecordRepository implements FinancialSettlementRecordRepositoryPort {
	async findByBookingId(bookingId: string): Promise<FinancialSettlementRecord[]> {
		const key = String(bookingId ?? "").trim()
		if (!key) return []
		const rows = await db
			.select()
			.from(FinancialSettlementRecordTable)
			.where(eq(FinancialSettlementRecordTable.bookingId, key))
			.orderBy(desc(FinancialSettlementRecordTable.settlementDate))
			.all()
		return rows.map(map)
	}

	async findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<FinancialSettlementRecord[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(FinancialSettlementRecordTable.providerId, providerId)]
		const bookingIds = Array.from(new Set((params.bookingIds ?? []).map(String).filter(Boolean)))
		if (bookingIds.length)
			filters.push(inArray(FinancialSettlementRecordTable.bookingId, bookingIds))
		const rows = await db
			.select()
			.from(FinancialSettlementRecordTable)
			.where(and(...filters))
			.orderBy(desc(FinancialSettlementRecordTable.settlementDate))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))
			.all()
		return rows.map(map)
	}

	async findExisting(params: {
		providerId: string
		settlementReference: string
	}): Promise<FinancialSettlementRecord | null> {
		const row = await db
			.select()
			.from(FinancialSettlementRecordTable)
			.where(
				and(
					eq(FinancialSettlementRecordTable.providerId, params.providerId),
					eq(FinancialSettlementRecordTable.settlementReference, params.settlementReference)
				)
			)
			.get()
		return row ? map(row) : null
	}

	async createIfAbsent(input: FinancialSettlementRecordCreateInput): Promise<{
		settlement: FinancialSettlementRecord
		created: boolean
	}> {
		const existing = await this.findExisting({
			providerId: input.providerId,
			settlementReference: input.settlementReference,
		})
		if (existing) return { settlement: existing, created: false }
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: new Date() }
		await db
			.insert(FinancialSettlementRecordTable)
			.values(row as any)
			.run()
		return { settlement: map(row), created: true }
	}
}
