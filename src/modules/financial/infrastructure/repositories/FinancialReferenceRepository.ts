import {
	and,
	desc,
	eq,
	FinancialReference as FinancialReferenceTable,
	db,
	inArray,
	sql,
} from "astro:db"

import type {
	FinancialReferenceCreateInput,
	FinancialReferenceRepositoryPort,
} from "../../application/ports/FinancialWorkflowRepositoryPort"
import type { FinancialReference, FinancialReferenceType } from "../../domain/financial-reference"

function map(row: any): FinancialReference {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		type: String(row.type) as FinancialReferenceType,
		referenceValue: String(row.referenceValue),
		externalSystem: row.externalSystem ?? null,
		amount: row.amount == null ? null : Number(row.amount),
		currency: row.currency ?? null,
		recordedAt: new Date(row.recordedAt),
		source: String(row.source) as FinancialReference["source"],
		basis: String(row.basis) as FinancialReference["basis"],
		createdAt: new Date(row.createdAt),
	}
}

export class FinancialReferenceRepository implements FinancialReferenceRepositoryPort {
	async findByBookingId(bookingId: string): Promise<FinancialReference[]> {
		const rows = await db
			.select()
			.from(FinancialReferenceTable)
			.where(eq(FinancialReferenceTable.bookingId, bookingId))
			.orderBy(desc(FinancialReferenceTable.recordedAt))
			.all()
		return rows.map(map)
	}

	async findByProvider(params?: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<FinancialReference[]> {
		const providerId = String(params?.providerId ?? "").trim()
		if (!providerId) return []
		const bookingIds = Array.from(new Set((params?.bookingIds || []).map(String).filter(Boolean)))
		const filters = [eq(FinancialReferenceTable.providerId, providerId)]
		if (bookingIds.length) filters.push(inArray(FinancialReferenceTable.bookingId, bookingIds))
		const rows = await db
			.select()
			.from(FinancialReferenceTable)
			.where(and(...filters))
			.orderBy(desc(FinancialReferenceTable.recordedAt))
			.limit(Math.max(1, Math.min(Number(params?.limit || 500), 1000)))
			.all()
		return rows.map(map)
	}

	async findExisting(params: {
		providerId: string
		bookingId: string
		type: FinancialReferenceType
		referenceValue: string
		externalSystem?: string | null
	}): Promise<FinancialReference | null> {
		const externalSystem = String(params.externalSystem ?? "")
		const filters = [
			eq(FinancialReferenceTable.providerId, params.providerId),
			eq(FinancialReferenceTable.bookingId, params.bookingId),
			eq(FinancialReferenceTable.type, params.type),
			eq(FinancialReferenceTable.referenceValue, params.referenceValue),
			sql`COALESCE(${FinancialReferenceTable.externalSystem}, '') = ${externalSystem}`,
		]
		const row = await db
			.select()
			.from(FinancialReferenceTable)
			.where(and(...filters))
			.get()
		return row ? map(row) : null
	}

	async createIfAbsent(input: FinancialReferenceCreateInput): Promise<{
		reference: FinancialReference
		created: boolean
	}> {
		const existing = await this.findExisting({
			providerId: input.providerId,
			bookingId: input.bookingId,
			type: input.type,
			referenceValue: input.referenceValue,
			externalSystem: input.externalSystem,
		})
		if (existing) return { reference: existing, created: false }
		const row = {
			...input,
			id: input.id ?? crypto.randomUUID(),
			createdAt: new Date(),
		}
		await db
			.insert(FinancialReferenceTable)
			.values(row as any)
			.run()
		return { reference: map(row), created: true }
	}
}
