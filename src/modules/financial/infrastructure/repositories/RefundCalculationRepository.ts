import {
	db,
	eq,
	RefundLedger as RefundLedgerTable,
	RefundQuote as RefundQuoteTable,
} from "astro:db"

import type { RefundCalculationRepositoryPort } from "../../application/ports/RefundCalculationRepositoryPort"
import type { RefundLedger } from "../../domain/refund-ledger"
import type { RefundQuote } from "../../domain/refund-quote"

function asDate(value: unknown): Date {
	if (value instanceof Date) return value
	const date = new Date(value as any)
	return Number.isFinite(date.getTime()) ? date : new Date(0)
}

function mapQuote(row: any): RefundQuote {
	return {
		id: String(row.id),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		status: String(row.status) as RefundQuote["status"],
		reason: String(row.reason),
		currency: String(row.currency ?? "").toUpperCase(),
		grossAmount: Number(row.grossAmount ?? 0),
		refundAmount: Number(row.refundAmount ?? 0),
		nonRefundableAmount: Number(row.nonRefundableAmount ?? 0),
		taxFeeRefundAmount: Number(row.taxFeeRefundAmount ?? 0),
		payoutImpactAmount: Number(row.payoutImpactAmount ?? 0),
		paymentDueLocal: row.paymentDueLocal == null ? null : String(row.paymentDueLocal),
		cancellationDeadlineLocal:
			row.cancellationDeadlineLocal == null ? null : String(row.cancellationDeadlineLocal),
		refundPercent: row.refundPercent == null ? null : Number(row.refundPercent),
		policySnapshot: (row.policySnapshotJson ?? {}) as RefundQuote["policySnapshot"],
		lines: Array.isArray(row.linesJson) ? (row.linesJson as RefundQuote["lines"]) : [],
		calculationSnapshotJson: row.calculationSnapshotJson ?? null,
		idempotencyKey: String(row.idempotencyKey),
		quotedAt: asDate(row.quotedAt),
		expiresAt: row.expiresAt == null ? null : asDate(row.expiresAt),
		createdBy: row.createdBy == null ? null : String(row.createdBy),
	}
}

function mapLedger(row: any): RefundLedger {
	return {
		id: String(row.id),
		refundQuoteId: String(row.refundQuoteId),
		bookingId: String(row.bookingId),
		providerId: String(row.providerId),
		status: String(row.status) as RefundLedger["status"],
		currency: String(row.currency ?? "").toUpperCase(),
		refundAmount: Number(row.refundAmount ?? 0),
		payoutImpactAmount: Number(row.payoutImpactAmount ?? 0),
		paymentTransactionId:
			row.paymentTransactionId == null ? null : String(row.paymentTransactionId),
		externalReference: row.externalReference == null ? null : String(row.externalReference),
		basis: String(row.basis),
		calculationSnapshotJson: row.calculationSnapshotJson ?? null,
		appliedAt: asDate(row.appliedAt),
		appliedBy: row.appliedBy == null ? null : String(row.appliedBy),
		createdAt: asDate(row.createdAt),
	}
}

export class RefundCalculationRepository implements RefundCalculationRepositoryPort {
	async saveQuoteIfAbsentByIdempotencyKey(quote: RefundQuote): Promise<{
		quote: RefundQuote
		created: boolean
	}> {
		const existing = await db
			.select()
			.from(RefundQuoteTable)
			.where(eq(RefundQuoteTable.idempotencyKey, quote.idempotencyKey))
			.get()
		if (existing) return { quote: mapQuote(existing), created: false }
		const row = {
			id: quote.id,
			bookingId: quote.bookingId,
			providerId: quote.providerId,
			status: quote.status,
			reason: quote.reason,
			currency: quote.currency,
			grossAmount: quote.grossAmount,
			refundAmount: quote.refundAmount,
			nonRefundableAmount: quote.nonRefundableAmount,
			taxFeeRefundAmount: quote.taxFeeRefundAmount,
			payoutImpactAmount: quote.payoutImpactAmount,
			paymentDueLocal: quote.paymentDueLocal,
			cancellationDeadlineLocal: quote.cancellationDeadlineLocal,
			refundPercent: quote.refundPercent,
			policySnapshotJson: quote.policySnapshot,
			linesJson: quote.lines,
			calculationSnapshotJson: quote.calculationSnapshotJson,
			idempotencyKey: quote.idempotencyKey,
			quotedAt: quote.quotedAt,
			expiresAt: quote.expiresAt,
			createdBy: quote.createdBy,
			createdAt: new Date(),
		}
		try {
			await db
				.insert(RefundQuoteTable)
				.values(row as any)
				.run()
		} catch {
			const existingAfterCollision = await db
				.select()
				.from(RefundQuoteTable)
				.where(eq(RefundQuoteTable.idempotencyKey, quote.idempotencyKey))
				.get()
			if (existingAfterCollision) return { quote: mapQuote(existingAfterCollision), created: false }
			throw new Error("REFUND_QUOTE_WRITE_FAILED")
		}
		return { quote: mapQuote(row), created: true }
	}

	async findQuoteById(id: string): Promise<RefundQuote | null> {
		const key = String(id ?? "").trim()
		if (!key) return null
		const row = await db.select().from(RefundQuoteTable).where(eq(RefundQuoteTable.id, key)).get()
		return row ? mapQuote(row) : null
	}

	async findQuotesByBookingId(bookingId: string): Promise<RefundQuote[]> {
		const key = String(bookingId ?? "").trim()
		if (!key) return []
		const rows = await db
			.select()
			.from(RefundQuoteTable)
			.where(eq(RefundQuoteTable.bookingId, key))
			.all()
		return rows.map(mapQuote)
	}

	async findLedgerByQuoteId(refundQuoteId: string): Promise<RefundLedger | null> {
		const key = String(refundQuoteId ?? "").trim()
		if (!key) return null
		const row = await db
			.select()
			.from(RefundLedgerTable)
			.where(eq(RefundLedgerTable.refundQuoteId, key))
			.get()
		return row ? mapLedger(row) : null
	}

	async recordLedgerEntry(entry: RefundLedger): Promise<RefundLedger> {
		const existing = await this.findLedgerByQuoteId(entry.refundQuoteId)
		if (existing) return existing
		const row = {
			id: entry.id,
			refundQuoteId: entry.refundQuoteId,
			bookingId: entry.bookingId,
			providerId: entry.providerId,
			status: entry.status,
			currency: entry.currency,
			refundAmount: entry.refundAmount,
			payoutImpactAmount: entry.payoutImpactAmount,
			paymentTransactionId: entry.paymentTransactionId,
			externalReference: entry.externalReference,
			basis: entry.basis,
			calculationSnapshotJson: entry.calculationSnapshotJson,
			appliedAt: entry.appliedAt,
			appliedBy: entry.appliedBy,
			createdAt: entry.createdAt,
		}
		try {
			await db
				.insert(RefundLedgerTable)
				.values(row as any)
				.run()
		} catch {
			const existingAfterCollision = await this.findLedgerByQuoteId(entry.refundQuoteId)
			if (existingAfterCollision) return existingAfterCollision
			throw new Error("REFUND_LEDGER_WRITE_FAILED")
		}
		return mapLedger(row)
	}

	async findLedgerByBookingId(bookingId: string): Promise<RefundLedger[]> {
		const key = String(bookingId ?? "").trim()
		if (!key) return []
		const rows = await db
			.select()
			.from(RefundLedgerTable)
			.where(eq(RefundLedgerTable.bookingId, key))
			.all()
		return rows.map(mapLedger)
	}
}
