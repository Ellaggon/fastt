import {
	first,
	and,
	desc,
	eq,
	ReconciliationMatch as ReconciliationMatchTable,
	db,
} from "@/shared/infrastructure/db/compat"

import type {
	ReconciliationMatchCreateInput,
	ReconciliationMatchRepositoryPort,
} from "../../application/ports/FinancialStage3RepositoryPort"
import type { ReconciliationMatch } from "../../domain/reconciliation-match"

function map(row: any): ReconciliationMatch {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		contractAmount: Number(row.contractAmount ?? 0),
		paymentAmount: row.paymentAmount == null ? null : Number(row.paymentAmount),
		settlementAmount: row.settlementAmount == null ? null : Number(row.settlementAmount),
		differenceAmount: Number(row.differenceAmount ?? 0),
		status: String(row.status) as ReconciliationMatch["status"],
		mismatchReasons: Array.isArray(row.mismatchReasons)
			? row.mismatchReasons
			: typeof row.mismatchReasons === "string"
				? JSON.parse(row.mismatchReasons || "[]")
				: [],
		basis: String(row.basis),
		reviewStatus: (row.reviewStatus ?? null) as ReconciliationMatch["reviewStatus"],
		reviewState: (row.reviewState ?? null) as ReconciliationMatch["reviewState"],
		comparisonFingerprint: row.comparisonFingerprint ?? null,
		reviewFingerprint: row.reviewFingerprint ?? null,
		reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
		reviewedBy: row.reviewedBy ?? null,
		reviewNote: row.reviewNote ?? null,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class ReconciliationMatchRepository implements ReconciliationMatchRepositoryPort {
	async findByBookingId(bookingId: string): Promise<ReconciliationMatch | null> {
		const key = String(bookingId ?? "").trim()
		if (!key) return null
		const row = await db
			.select()
			.from(ReconciliationMatchTable)
			.where(eq(ReconciliationMatchTable.bookingId, key))
			.then(first)
		return row ? map(row) : null
	}

	async findByBookingIdForProvider(
		bookingId: string,
		providerId: string
	): Promise<ReconciliationMatch | null> {
		const key = String(bookingId ?? "").trim()
		const provider = String(providerId ?? "").trim()
		if (!key || !provider) return null
		const row = await db
			.select()
			.from(ReconciliationMatchTable)
			.where(
				and(
					eq(ReconciliationMatchTable.bookingId, key),
					eq(ReconciliationMatchTable.providerId, provider)
				)
			)
			.then(first)
		return row ? map(row) : null
	}

	async findByProvider(params: {
		providerId: string
		status?: ReconciliationMatch["status"] | "all"
		reviewStatus?: ReconciliationMatch["reviewStatus"] | "all"
		limit?: number
	}): Promise<ReconciliationMatch[]> {
		const providerId = String(params.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(ReconciliationMatchTable.providerId, providerId)]
		if (params.status && params.status !== "all")
			filters.push(eq(ReconciliationMatchTable.status, params.status))
		if (params.reviewStatus && params.reviewStatus !== "all") {
			filters.push(eq(ReconciliationMatchTable.reviewStatus, params.reviewStatus))
		}
		const rows = await db
			.select()
			.from(ReconciliationMatchTable)
			.where(and(...filters))
			.orderBy(desc(ReconciliationMatchTable.updatedAt))
			.limit(Math.max(1, Math.min(Number(params.limit ?? 500), 1000)))

		return rows.map(map)
	}

	async createOrUpdate(input: ReconciliationMatchCreateInput): Promise<ReconciliationMatch> {
		const existing = await this.findByBookingIdForProvider(input.bookingId, input.providerId)
		const now = new Date()
		if (existing) {
			await db
				.update(ReconciliationMatchTable)
				.set({ ...input, updatedAt: now } as any)
				.where(
					and(
						eq(ReconciliationMatchTable.id, existing.id),
						eq(ReconciliationMatchTable.providerId, input.providerId)
					)
				)

			return (await this.findByBookingIdForProvider(
				input.bookingId,
				input.providerId
			)) as ReconciliationMatch
		}
		const row = {
			...input,
			id: input.id ?? crypto.randomUUID(),
			reviewStatus: input.reviewStatus ?? "unreviewed",
			createdAt: now,
			updatedAt: now,
		}
		await db.insert(ReconciliationMatchTable).values(row as any)

		return map(row)
	}

	async markReviewed(params: {
		id: string
		providerId: string
		reviewedBy: string
		reviewNote?: string | null
	}): Promise<ReconciliationMatch | null> {
		const now = new Date()
		await db
			.update(ReconciliationMatchTable)
			.set({
				reviewStatus: "reviewed",
				reviewedAt: now,
				reviewedBy: params.reviewedBy,
				reviewNote: params.reviewNote ?? null,
				updatedAt: now,
			} as any)
			.where(
				and(
					eq(ReconciliationMatchTable.id, params.id),
					eq(ReconciliationMatchTable.providerId, params.providerId)
				)
			)

		const rows = await this.findByProvider({ providerId: params.providerId, limit: 1000 })
		return rows.find((row) => row.id === params.id) ?? null
	}
}
