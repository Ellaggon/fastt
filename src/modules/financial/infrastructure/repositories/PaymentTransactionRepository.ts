import {
	and,
	desc,
	eq,
	inArray,
	PaymentTransaction as PaymentTransactionTable,
	db,
	sql,
} from "astro:db"

import type {
	PaymentTransactionCreateInput,
	PaymentTransactionRepositoryPort,
} from "../../application/ports/FinancialStage3RepositoryPort"
import type { PaymentTransaction, PaymentTransactionType } from "../../domain/payment-transaction"

function map(row: any): PaymentTransaction {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		type: String(row.type) as PaymentTransaction["type"],
		status: String(row.status) as PaymentTransaction["status"],
		amount: Number(row.amount ?? 0),
		currency: String(row.currency ?? "").toUpperCase(),
		externalReference: String(row.externalReference),
		pspProvider: String(row.pspProvider),
		idempotencyKey: String(row.idempotencyKey),
		occurredAt: new Date(row.occurredAt),
		source: String(row.source) as PaymentTransaction["source"],
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class PaymentTransactionRepository implements PaymentTransactionRepositoryPort {
	async findByBookingId(bookingId: string): Promise<PaymentTransaction[]> {
		const key = String(bookingId ?? "").trim()
		if (!key) return []
		const rows = await db
			.select()
			.from(PaymentTransactionTable)
			.where(eq(PaymentTransactionTable.bookingId, key))
			.orderBy(desc(PaymentTransactionTable.occurredAt))
			.all()
		return rows.map(map)
	}

	async findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		type?: PaymentTransactionType | "all"
		limit?: number
	}): Promise<PaymentTransaction[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(PaymentTransactionTable.providerId, providerId)]
		const bookingIds = Array.from(new Set((params.bookingIds ?? []).map(String).filter(Boolean)))
		if (bookingIds.length) filters.push(inArray(PaymentTransactionTable.bookingId, bookingIds))
		if (params.type && params.type !== "all")
			filters.push(eq(PaymentTransactionTable.type, params.type))
		const rows = await db
			.select()
			.from(PaymentTransactionTable)
			.where(and(...filters))
			.orderBy(desc(PaymentTransactionTable.occurredAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))
			.all()
		return rows.map(map)
	}

	async findExisting(params: {
		providerId: string
		pspProvider: string
		externalReference: string
		type: PaymentTransactionType
	}): Promise<PaymentTransaction | null> {
		const row = await db
			.select()
			.from(PaymentTransactionTable)
			.where(
				and(
					eq(PaymentTransactionTable.providerId, params.providerId),
					eq(PaymentTransactionTable.pspProvider, params.pspProvider),
					eq(PaymentTransactionTable.externalReference, params.externalReference),
					eq(PaymentTransactionTable.type, params.type)
				)
			)
			.get()
		return row ? map(row) : null
	}

	async findUnmatchedByProvider(params: {
		providerId: string
		limit?: number
	}): Promise<PaymentTransaction[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const rows = await db
			.select()
			.from(PaymentTransactionTable)
			.where(
				and(
					eq(PaymentTransactionTable.providerId, providerId),
					sql`${PaymentTransactionTable.bookingId} LIKE 'unmatched:%'`
				)
			)
			.orderBy(desc(PaymentTransactionTable.occurredAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 100), 500)))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: PaymentTransactionCreateInput): Promise<{
		transaction: PaymentTransaction
		created: boolean
	}> {
		const existing = await this.findExisting({
			providerId: input.providerId,
			pspProvider: input.pspProvider,
			externalReference: input.externalReference,
			type: input.type,
		})
		if (existing) return { transaction: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		try {
			await db
				.insert(PaymentTransactionTable)
				.values(row as any)
				.run()
		} catch (error) {
			const existingAfterCollision = await this.findExisting({
				providerId: input.providerId,
				pspProvider: input.pspProvider,
				externalReference: input.externalReference,
				type: input.type,
			})
			if (existingAfterCollision) return { transaction: existingAfterCollision, created: false }
			throw error
		}
		return { transaction: map(row), created: true }
	}

	async findDuplicateExternalReferences(
		providerId: string
	): Promise<
		Array<{ pspProvider: string; externalReference: string; count: number; bookingIds: string[] }>
	> {
		const rows = await this.findByProvider({ providerId, limit: 1000 })
		const buckets = new Map<string, PaymentTransaction[]>()
		for (const row of rows) {
			const key = `${row.pspProvider}::${row.externalReference}`
			const bucket = buckets.get(key) ?? []
			bucket.push(row)
			buckets.set(key, bucket)
		}
		return [...buckets.values()]
			.filter((bucket) => bucket.length > 1)
			.map((bucket) => ({
				pspProvider: bucket[0].pspProvider,
				externalReference: bucket[0].externalReference,
				count: bucket.length,
				bookingIds: [...new Set(bucket.map((row) => row.bookingId))],
			}))
	}
}
