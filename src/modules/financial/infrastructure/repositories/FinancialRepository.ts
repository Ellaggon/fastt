import { FinancialShadowRecord, db, eq } from "astro:db"

import type { FinancialRepositoryPort } from "../../application/ports/FinancialRepositoryPort"
import type { LegacyPaymentIntentShadow } from "../../domain/payment-intent"
import type { LegacyRefundShadow } from "../../domain/refund-record"
import type { LegacySettlementShadow } from "../../domain/settlement-record"

type BookingFinancialRecords = {
	paymentIntents: LegacyPaymentIntentShadow[]
	settlementRecords: LegacySettlementShadow[]
	refundRecords: LegacyRefundShadow[]
}

export class FinancialRepository implements FinancialRepositoryPort {
	async saveLegacyPaymentIntentShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacyPaymentIntentShadow
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "payment_intent",
			payload: params.record,
		})
	}

	async saveLegacySettlementShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacySettlementShadow
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "settlement_record",
			payload: params.record,
		})
	}

	async saveLegacyRefundShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacyRefundShadow
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "refund_record",
			payload: params.record,
		})
	}

	async findLegacyPaymentIntentShadowByIdempotencyKey(
		idempotencyKey: string
	): Promise<LegacyPaymentIntentShadow | null> {
		const key = String(idempotencyKey ?? "").trim()
		if (!key) return null
		const row = await db
			.select({
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
			})
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.idempotencyKey, key))
			.get()
		if (
			!row ||
			row.type !== "payment_intent" ||
			row.payload == null ||
			typeof row.payload !== "object"
		) {
			return null
		}
		return row.payload as LegacyPaymentIntentShadow
	}

	async findByBookingId(bookingId: string): Promise<BookingFinancialRecords> {
		const key = String(bookingId ?? "").trim()
		if (!key) {
			return {
				paymentIntents: [],
				settlementRecords: [],
				refundRecords: [],
			}
		}
		const rows = await db
			.select({
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
			})
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.bookingId, key))
			.all()

		const paymentIntents: LegacyPaymentIntentShadow[] = []
		const settlementRecords: LegacySettlementShadow[] = []
		const refundRecords: LegacyRefundShadow[] = []

		for (const row of rows) {
			if (row.payload == null || typeof row.payload !== "object") continue
			if (row.type === "payment_intent") {
				paymentIntents.push(row.payload as LegacyPaymentIntentShadow)
				continue
			}
			if (row.type === "settlement_record") {
				settlementRecords.push(row.payload as LegacySettlementShadow)
				continue
			}
			if (row.type === "refund_record") {
				refundRecords.push(row.payload as LegacyRefundShadow)
			}
		}
		return {
			paymentIntents,
			settlementRecords,
			refundRecords,
		}
	}

	private async saveIfAbsent(params: {
		idempotencyKey: string
		bookingId: string
		type: "payment_intent" | "settlement_record" | "refund_record"
		payload: unknown
	}): Promise<"created" | "already_exists"> {
		const key = String(params.idempotencyKey ?? "").trim()
		const bookingId = String(params.bookingId ?? "").trim()
		if (!key || !bookingId) return "already_exists"

		const existing = await db
			.select({ id: FinancialShadowRecord.id })
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.idempotencyKey, key))
			.get()
		if (existing) return "already_exists"

		try {
			await db
				.insert(FinancialShadowRecord)
				.values({
					id: crypto.randomUUID(),
					bookingId,
					type: params.type,
					payload: params.payload as any,
					idempotencyKey: key,
					createdAt: new Date(),
				})
				.run()
			return "created"
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (message.includes("UNIQUE constraint failed")) {
				return "already_exists"
			}
			throw error
		}
	}
}
