import { and, desc, eq, FinancialReviewEvent as FinancialReviewEventTable, db } from "astro:db"

import type {
	FinancialReviewEventCreateInput,
	FinancialReviewEventRepositoryPort,
} from "../../application/ports/FinancialWorkflowRepositoryPort"
import type { FinancialReviewEvent } from "../../domain/financial-review-event"

function map(row: any): FinancialReviewEvent {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		financialExceptionId: row.financialExceptionId ?? null,
		financialReferenceId: row.financialReferenceId ?? null,
		refundHandoffId: row.refundHandoffId ?? null,
		reconciliationMatchId: row.reconciliationMatchId ?? null,
		type: String(row.type) as FinancialReviewEvent["type"],
		actorId: row.actorId ?? null,
		actorType: String(row.actorType) as FinancialReviewEvent["actorType"],
		payloadJson: row.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : null,
		createdAt: new Date(row.createdAt),
	}
}

export class FinancialReviewEventRepository implements FinancialReviewEventRepositoryPort {
	async append(input: FinancialReviewEventCreateInput): Promise<FinancialReviewEvent> {
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: new Date() }
		await db
			.insert(FinancialReviewEventTable)
			.values(row as any)
			.run()
		return map(row)
	}

	async findByProvider(params?: {
		providerId: string
		bookingId?: string
		financialExceptionId?: string
		refundHandoffId?: string
		reconciliationMatchId?: string
		limit?: number
	}): Promise<FinancialReviewEvent[]> {
		const providerId = String(params?.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(FinancialReviewEventTable.providerId, providerId)]
		if (params?.bookingId) filters.push(eq(FinancialReviewEventTable.bookingId, params.bookingId))
		if (params?.financialExceptionId) {
			filters.push(eq(FinancialReviewEventTable.financialExceptionId, params.financialExceptionId))
		}
		if (params?.refundHandoffId) {
			filters.push(eq(FinancialReviewEventTable.refundHandoffId, params.refundHandoffId))
		}
		if (params?.reconciliationMatchId) {
			filters.push(
				eq(FinancialReviewEventTable.reconciliationMatchId, params.reconciliationMatchId)
			)
		}
		const rows = await db
			.select()
			.from(FinancialReviewEventTable)
			.where(and(...filters))
			.orderBy(desc(FinancialReviewEventTable.createdAt))
			.limit(Math.min(Math.max(Number(params?.limit ?? 100), 1), 250))
			.all()
		return rows.map(map)
	}
}
