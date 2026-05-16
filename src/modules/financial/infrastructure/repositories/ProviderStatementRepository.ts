import { and, db, desc, eq, ProviderStatement as ProviderStatementTable } from "astro:db"

import type {
	ProviderStatementCreateInput,
	ProviderStatementRepositoryPort,
} from "../../application/ports/ProviderFinanceRepositoryPort"
import type { ProviderStatement } from "../../domain/provider-statement"

function map(row: any): ProviderStatement {
	return {
		id: String(row.id),
		providerId: String(row.providerId),
		statementReference: row.statementReference ?? null,
		periodStart: row.periodStart ? new Date(row.periodStart) : null,
		periodEnd: row.periodEnd ? new Date(row.periodEnd) : null,
		status: String(row.status) as ProviderStatement["status"],
		totalGrossAmount: Number(row.totalGrossAmount ?? 0),
		totalCommissionAmount: Number(row.totalCommissionAmount ?? 0),
		totalTaxAmount: Number(row.totalTaxAmount ?? 0),
		totalNetPayable: Number(row.totalNetPayable ?? 0),
		currency: String(row.currency ?? "").toUpperCase(),
		basis: String(row.basis) as ProviderStatement["basis"],
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class ProviderStatementRepository implements ProviderStatementRepositoryPort {
	async findByProvider(params: {
		providerId: string
		status?: ProviderStatement["status"] | "all"
		limit?: number
	}): Promise<ProviderStatement[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(ProviderStatementTable.providerId, providerId)]
		if (params.status && params.status !== "all")
			filters.push(eq(ProviderStatementTable.status, params.status))
		const rows = await db
			.select()
			.from(ProviderStatementTable)
			.where(and(...filters))
			.orderBy(desc(ProviderStatementTable.updatedAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 100), 500)))
			.all()
		return rows.map(map)
	}

	async createIfAbsent(input: ProviderStatementCreateInput): Promise<{
		statement: ProviderStatement
		created: boolean
	}> {
		const existing = (
			await this.findByProvider({ providerId: input.providerId, status: input.status, limit: 1 })
		)[0]
		if (existing) return { statement: existing, created: false }
		const now = new Date()
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now }
		await db
			.insert(ProviderStatementTable)
			.values(row as any)
			.run()
		return { statement: map(row), created: true }
	}
}
