import { and, desc, eq, FinancialExceptionRecord as FinancialExceptionTable, db } from "astro:db"

import type {
	FinancialExceptionCreateInput,
	FinancialExceptionRepositoryPort,
} from "../../application/ports/FinancialWorkflowRepositoryPort"
import type {
	FinancialExceptionCode,
	FinancialExceptionRecord,
	FinancialExceptionStatus,
} from "../../domain/financial-exception-record"

function map(row: any): FinancialExceptionRecord {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		code: String(row.code) as FinancialExceptionCode,
		severity: String(row.severity) as FinancialExceptionRecord["severity"],
		status: String(row.status) as FinancialExceptionStatus,
		basis: String(row.basis) as FinancialExceptionRecord["basis"],
		reason: String(row.reason),
		nextOwner: String(row.nextOwner) as FinancialExceptionRecord["nextOwner"],
		source: String(row.source) as FinancialExceptionRecord["source"],
		openedAt: new Date(row.openedAt),
		acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt) : null,
		resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
		resolvedBy: row.resolvedBy ?? null,
		resolutionNote: row.resolutionNote ?? null,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class FinancialExceptionRepository implements FinancialExceptionRepositoryPort {
	async findByProvider(params?: {
		providerId: string
		status?: FinancialExceptionStatus | "all"
		code?: FinancialExceptionCode | "all"
		nextOwner?: string | "all"
		bookingId?: string
		limit?: number
	}): Promise<FinancialExceptionRecord[]> {
		const providerId = String(params?.providerId ?? "").trim()
		if (!providerId) return []
		const filters = [eq(FinancialExceptionTable.providerId, providerId)]
		if (params?.status && params.status !== "all")
			filters.push(eq(FinancialExceptionTable.status, params.status))
		if (params?.code && params.code !== "all")
			filters.push(eq(FinancialExceptionTable.code, params.code))
		if (params?.nextOwner && params.nextOwner !== "all")
			filters.push(eq(FinancialExceptionTable.nextOwner, params.nextOwner))
		if (params?.bookingId) filters.push(eq(FinancialExceptionTable.bookingId, params.bookingId))
		const query = db
			.select()
			.from(FinancialExceptionTable)
			.where(and(...filters))
			.orderBy(desc(FinancialExceptionTable.openedAt))
			.limit(Math.min(Math.max(Number(params?.limit ?? 100), 1), 250))
		const rows = await query.all()
		return rows.map(map)
	}

	async findByIdForProvider(
		id: string,
		providerId: string
	): Promise<FinancialExceptionRecord | null> {
		const row = await db
			.select()
			.from(FinancialExceptionTable)
			.where(
				and(eq(FinancialExceptionTable.id, id), eq(FinancialExceptionTable.providerId, providerId))
			)
			.get()
		return row ? map(row) : null
	}

	async findByBookingAndCode(params: {
		bookingId: string
		code: FinancialExceptionCode
	}): Promise<FinancialExceptionRecord[]> {
		const rows = await db
			.select()
			.from(FinancialExceptionTable)
			.where(
				and(
					eq(FinancialExceptionTable.bookingId, params.bookingId),
					eq(FinancialExceptionTable.code, params.code)
				)
			)
			.orderBy(desc(FinancialExceptionTable.openedAt))
			.all()
		return rows.map(map)
	}

	async create(input: FinancialExceptionCreateInput): Promise<FinancialExceptionRecord> {
		const now = new Date()
		const row = {
			...input,
			id: input.id ?? crypto.randomUUID(),
			createdAt: now,
			updatedAt: now,
		}
		await db
			.insert(FinancialExceptionTable)
			.values(row as any)
			.run()
		return map(row)
	}

	async acknowledge(params: {
		id: string
		providerId: string
		acknowledgedAt: Date
	}): Promise<FinancialExceptionRecord | null> {
		const existing = await this.findByIdForProvider(params.id, params.providerId)
		if (!existing) return null
		if (existing.status === "acknowledged") return existing
		await db
			.update(FinancialExceptionTable)
			.set({
				status: "acknowledged",
				acknowledgedAt: params.acknowledgedAt,
				updatedAt: new Date(),
			} as any)
			.where(
				and(
					eq(FinancialExceptionTable.id, params.id),
					eq(FinancialExceptionTable.providerId, params.providerId)
				)
			)
			.run()
		return this.findByIdForProvider(params.id, params.providerId)
	}

	async resolve(params: {
		id: string
		providerId: string
		resolvedAt: Date
		resolvedBy: string
		resolutionNote: string
		status: Extract<FinancialExceptionStatus, "resolved" | "dismissed">
	}): Promise<FinancialExceptionRecord | null> {
		await db
			.update(FinancialExceptionTable)
			.set({
				status: params.status,
				resolvedAt: params.resolvedAt,
				resolvedBy: params.resolvedBy,
				resolutionNote: params.resolutionNote,
				updatedAt: new Date(),
			} as any)
			.where(
				and(
					eq(FinancialExceptionTable.id, params.id),
					eq(FinancialExceptionTable.providerId, params.providerId)
				)
			)
			.run()
		return this.findByIdForProvider(params.id, params.providerId)
	}
}
