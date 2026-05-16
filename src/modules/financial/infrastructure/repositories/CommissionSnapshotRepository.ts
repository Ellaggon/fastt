import { and, CommissionSnapshot as CommissionSnapshotTable, db, desc, eq, inArray } from "astro:db"

import type {
	CommissionSnapshotCreateInput,
	CommissionSnapshotRepositoryPort,
} from "../../application/ports/ProviderFinanceRepositoryPort"
import type { CommissionSnapshot } from "../../domain/commission-snapshot"

function map(row: any): CommissionSnapshot {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		commissionRate: Number(row.commissionRate ?? 0),
		commissionAmount: Number(row.commissionAmount ?? 0),
		basis: String(row.basis) as CommissionSnapshot["basis"],
		currency: String(row.currency ?? "").toUpperCase(),
		snapshotAt: new Date(row.snapshotAt),
		createdAt: new Date(row.createdAt),
	}
}

export class CommissionSnapshotRepository implements CommissionSnapshotRepositoryPort {
	async findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<CommissionSnapshot[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(CommissionSnapshotTable.providerId, providerId)]
		const bookingIds = Array.from(new Set((params.bookingIds ?? []).map(String).filter(Boolean)))
		if (bookingIds.length) filters.push(inArray(CommissionSnapshotTable.bookingId, bookingIds))
		const rows = await db
			.select()
			.from(CommissionSnapshotTable)
			.where(and(...filters))
			.orderBy(desc(CommissionSnapshotTable.snapshotAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: CommissionSnapshotCreateInput): Promise<{
		snapshot: CommissionSnapshot
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
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: new Date() }
		await db
			.insert(CommissionSnapshotTable)
			.values(row as any)
			.run()
		return { snapshot: map(row), created: true }
	}
}
