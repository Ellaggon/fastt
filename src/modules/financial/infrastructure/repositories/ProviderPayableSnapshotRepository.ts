import {
	and,
	ProviderPayableSnapshot as ProviderPayableSnapshotTable,
	db,
	desc,
	eq,
	inArray,
} from "astro:db"

import type {
	ProviderPayableSnapshotCreateInput,
	ProviderPayableSnapshotRepositoryPort,
} from "../../application/ports/ProviderFinanceRepositoryPort"
import type { ProviderPayableSnapshot } from "../../domain/provider-payable-snapshot"

function map(row: any): ProviderPayableSnapshot {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		grossAmount: Number(row.grossAmount ?? 0),
		commissionAmount: Number(row.commissionAmount ?? 0),
		taxAmount: Number(row.taxAmount ?? 0),
		netPayable: Number(row.netPayable ?? 0),
		currency: String(row.currency ?? "").toUpperCase(),
		basis: String(row.basis) as ProviderPayableSnapshot["basis"],
		snapshotAt: new Date(row.snapshotAt),
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class ProviderPayableSnapshotRepository implements ProviderPayableSnapshotRepositoryPort {
	async findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<ProviderPayableSnapshot[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(ProviderPayableSnapshotTable.providerId, providerId)]
		const bookingIds = Array.from(new Set((params.bookingIds ?? []).map(String).filter(Boolean)))
		if (bookingIds.length) filters.push(inArray(ProviderPayableSnapshotTable.bookingId, bookingIds))
		const rows = await db
			.select()
			.from(ProviderPayableSnapshotTable)
			.where(and(...filters))
			.orderBy(desc(ProviderPayableSnapshotTable.snapshotAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: ProviderPayableSnapshotCreateInput): Promise<{
		snapshot: ProviderPayableSnapshot
		created: boolean
	}> {
		const existing = (
			await this.findByProvider({
				providerId: input.providerId,
				bookingIds: [input.bookingId],
				limit: 1,
			})
		)[0]
		if (existing) return { snapshot: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		await db
			.insert(ProviderPayableSnapshotTable)
			.values(row as any)
			.run()
		return { snapshot: map(row), created: true }
	}
}
